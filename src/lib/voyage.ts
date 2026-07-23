// P-3 — Voyage embedding client (hardened).
//
// WHY THIS FILE EXISTS (Build 1 — the silent-fail fix):
// Before P-3, every embedding call was an inline `fetch` to Voyage that, on a
// rate-limit (HTTP 429) or a transient 5xx, either threw (and got swallowed by
// a fire-and-forget `.catch(() => {})` on the client) or returned null with no
// signal — so an embed could FAIL while the surrounding action reported
// success and the record silently never got a vector. When Voyage was capped
// at 3 requests/min (no payment method), that happened constantly.
//
// This client fixes that class of bug for good:
//   • 429-aware retry with exponential backoff + jitter, honoring Retry-After.
//   • Retries transient 5xx and network errors; does NOT retry a real 4xx
//     (e.g. a 400 bad-request) — those are surfaced immediately.
//   • Batch queueing: >1 input is chunked to stay under Voyage's per-request
//     limits, each chunk retried independently; the results are stitched back
//     in order.
//   • A DISCRIMINATED result type. There is no "empty success": a caller can
//     never mistake a failure for a done embed. `{ ok: false, ... }` carries
//     the status and a human-readable error to surface.
//
// Doctrine: a failed embed must NEVER report success. Everything here returns
// ok:false rather than throwing so callers handle it explicitly.

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const MODEL = "voyage-large-2"; // 1536 dims — locked for P-3 (see MASTER-STATE).
const EMBED_DIMS = 1536;

// Voyage accepts up to 128 inputs / request; stay well under to avoid the
// token ceiling on long framework texts.
const MAX_BATCH = 96;

// Retry policy. voyage-large-2 at Usage Tier 1 is 2,000 RPM, so 429s should be
// rare now — but a burst backfill can still transiently trip a limit, and this
// is exactly the case the old code got wrong.
const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 8000;

export type EmbedOk = { ok: true; vectors: string[] };
export type EmbedErr = {
  ok: false;
  error: string;
  status: number | null;
  rateLimited: boolean;
};
export type EmbedResult = EmbedOk | EmbedErr;

export type SingleOk = { ok: true; vector: string };
export type SingleResult = SingleOk | EmbedErr;

export type InputType = "query" | "document";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Deterministic backoff with a small deterministic jitter (no Math.random so
// behaviour is reproducible under test): attempt n waits base * 2^(n-1),
// capped, plus a fixed 137ms nudge so parallel callers don't perfectly align.
function backoffDelay(attempt: number, retryAfterHeader: string | null): number {
  const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : NaN;
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * 1000, MAX_DELAY_MS);
  }
  const raw = BASE_DELAY_MS * 2 ** (attempt - 1) + 137;
  return Math.min(raw, MAX_DELAY_MS);
}

function toPgVector(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

// One Voyage request for a chunk of <= MAX_BATCH inputs, with retry. Returns
// the vectors in input order, or a typed error.
async function embedChunk(
  inputs: string[],
  inputType: InputType | undefined,
  signal?: AbortSignal
): Promise<EmbedResult> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "VOYAGE_API_KEY is not set", status: null, rateLimited: false };
  }

  const body: Record<string, unknown> = { input: inputs, model: MODEL };
  if (inputType) body.input_type = inputType;

  let lastErr: EmbedErr = {
    ok: false,
    error: "Embedding failed",
    status: null,
    rateLimited: false,
  };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(VOYAGE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      // Network / abort error — transient, retry.
      lastErr = {
        ok: false,
        error: err instanceof Error ? err.message : "Network error calling Voyage",
        status: null,
        rateLimited: false,
      };
      if (attempt < MAX_ATTEMPTS) {
        await sleep(backoffDelay(attempt, null));
        continue;
      }
      return lastErr;
    }

    if (res.ok) {
      let data: { data?: { embedding?: number[]; index?: number }[] };
      try {
        data = await res.json();
      } catch {
        lastErr = { ok: false, error: "Voyage returned unparseable JSON", status: res.status, rateLimited: false };
        if (attempt < MAX_ATTEMPTS) {
          await sleep(backoffDelay(attempt, null));
          continue;
        }
        return lastErr;
      }
      const rows = data.data;
      if (!Array.isArray(rows) || rows.length !== inputs.length) {
        return {
          ok: false,
          error: `Voyage returned ${rows?.length ?? 0} embeddings for ${inputs.length} inputs`,
          status: res.status,
          rateLimited: false,
        };
      }
      // Order by `index` when present, else assume request order.
      const ordered = [...rows].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
      const vectors: string[] = [];
      for (const row of ordered) {
        if (!Array.isArray(row.embedding) || row.embedding.length !== EMBED_DIMS) {
          return {
            ok: false,
            error: `Voyage embedding had wrong dimensionality (expected ${EMBED_DIMS})`,
            status: res.status,
            rateLimited: false,
          };
        }
        vectors.push(toPgVector(row.embedding));
      }
      return { ok: true, vectors };
    }

    // Non-2xx. Read the body once for the error message.
    const errText = await res.text().catch(() => "");
    const rateLimited = res.status === 429;
    const retryable = rateLimited || res.status >= 500;
    lastErr = {
      ok: false,
      error: `Voyage API ${res.status}${errText ? `: ${errText.slice(0, 300)}` : ""}`,
      status: res.status,
      rateLimited,
    };

    if (retryable && attempt < MAX_ATTEMPTS) {
      await sleep(backoffDelay(attempt, res.headers.get("retry-after")));
      continue;
    }
    // Non-retryable 4xx, or out of attempts — surface it.
    return lastErr;
  }

  return lastErr;
}

/**
 * Embed a batch of texts. Chunks to stay under Voyage's per-request ceiling and
 * retries each chunk on 429 / 5xx / network error. All-or-nothing: if any chunk
 * ultimately fails, the whole call returns ok:false — a partial batch is never
 * reported as success. Returns pgvector literal strings (`[v1,v2,...]`) in input
 * order, ready to write straight into a `vector(1536)` column.
 */
export async function embedTexts(
  inputs: string[],
  opts: { inputType?: InputType; signal?: AbortSignal } = {}
): Promise<EmbedResult> {
  if (inputs.length === 0) return { ok: true, vectors: [] };

  const out: string[] = [];
  for (let i = 0; i < inputs.length; i += MAX_BATCH) {
    const chunk = inputs.slice(i, i + MAX_BATCH);
    const res = await embedChunk(chunk, opts.inputType, opts.signal);
    if (!res.ok) return res; // never stitch a partial batch into a "success"
    out.push(...res.vectors);
  }
  return { ok: true, vectors: out };
}

/** Embed a single text. Convenience wrapper over embedTexts. */
export async function embedText(
  input: string,
  opts: { inputType?: InputType; signal?: AbortSignal } = {}
): Promise<SingleResult> {
  const res = await embedTexts([input], opts);
  if (!res.ok) return res;
  return { ok: true, vector: res.vectors[0] };
}

export const VOYAGE_MODEL = MODEL;
export const VOYAGE_DIMS = EMBED_DIMS;
