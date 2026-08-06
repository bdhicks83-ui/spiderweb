// EXPOSURE / BLOCK 2 — precedence extraction jobs.
//
//   1. extractPrecedenceJob  (event: precedence/extract)  — one record.
//   2. backfillPrecedenceJob (event: precedence/backfill) — every unchecked
//      record in an org.
//
// ⭐ THE LATCH IS pattern_records.precedence_checked_at. NULL means extraction
// has never run. It is stamped only on a SUCCESSFUL model call — including the
// very common and correct case where the model finds nothing, which is a real
// answer and must not be retried forever. A model FAILURE leaves it null so a
// later pass picks the record back up.
//
// ⭐ 'implied' LINKS ARE STORED AND NEVER SHOWN in this build. Storing them
// costs nothing and means a future build does not have to re-read every
// framework; showing them would train people to ignore warnings.
import { inngest } from "./client";
import { createClient } from "@supabase/supabase-js";
import { extractPrecedenceLinks } from "@/lib/claude";
import { embedText } from "@/lib/voyage";
import type { FrameworkArtifact } from "@/lib/elicitation";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PRECEDENCE_COLUMNS =
  "id, org_id, status, framework, context_summary, trigger_signal, signal_detail, " +
  "judgment, rationale, boundaries, precedence_checked_at";

type PrecedenceSourceRow = {
  id: string;
  org_id: string | null;
  status: string | null;
  framework: FrameworkArtifact | null;
  context_summary: string | null;
  trigger_signal: string | null;
  signal_detail: string | null;
  judgment: string | null;
  rationale: string | null;
  boundaries: string | null;
  precedence_checked_at: string | null;
};

async function extractForRecord(
  record: PrecedenceSourceRow
): Promise<{ ok: boolean; stated: number; implied: number; note: string }> {
  if (!record.org_id || record.status !== "complete") {
    return { ok: false, stated: 0, implied: 0, note: "not an extractable record" };
  }

  const result = await extractPrecedenceLinks({
    frameworkName: record.framework?.name ?? "",
    frameworkTagline: record.framework?.tagline ?? "",
    contextSummary: record.context_summary ?? "",
    triggerSignal: record.trigger_signal ?? "",
    signalDetail: record.signal_detail ?? "",
    judgment: record.judgment ?? "",
    rationale: record.rationale ?? "",
    boundaries: record.boundaries ?? "",
  });

  // ok:false = the model or the parse failed. Leave the latch NULL so a later
  // pass retries. An empty array is different: it is a real answer and DOES latch.
  if (!result.ok) {
    return {
      ok: false,
      stated: 0,
      implied: 0,
      note: `extraction failed (${result.diagnostic}) — left unlatched for retry`,
    };
  }
  const links = result.links;

  let stated = 0;
  let implied = 0;
  for (const link of links) {
    // The antecedent is embedded as a QUERY on purpose — at read time it is
    // matched against the document-type vectors on pattern_records, which is
    // the exact geometry the 0.75 relevance bar was tuned against.
    const embed = await embedText(link.antecedent, { inputType: "query" });
    const { error } = await supabase.from("precedence_links").upsert(
      {
        org_id: record.org_id,
        antecedent_text: link.antecedent,
        consequent_text: link.consequent,
        source_pattern_id: record.id,
        // A failed embed is NOT fatal: the lexical half of matching still works
        // and the row is still worth having. Never claimed as embedded when it
        // is not — the column is simply null.
        antecedent_embedding: embed.ok ? embed.vector : null,
        confidence: link.confidence,
        extracted_at: new Date().toISOString(),
      },
      { onConflict: "source_pattern_id,antecedent_text,consequent_text" }
    );
    if (error) {
      console.error(`precedence: link insert failed for ${record.id}: ${error.message}`);
      continue;
    }
    if (link.confidence === "stated") stated++;
    else implied++;
  }

  await supabase
    .from("pattern_records")
    .update({ precedence_checked_at: new Date().toISOString() })
    .eq("id", record.id);

  return {
    ok: true,
    stated,
    implied,
    note: links.length === 0 ? "no precedence claim in this framework" : "extracted",
  };
}

export const extractPrecedenceJob = inngest.createFunction(
  { id: "precedence-extract", retries: 2 },
  { event: "precedence/extract" },
  async ({ event, step }) => {
    const recordId = event.data?.record_id as string | undefined;
    if (!recordId) return { skipped: "no record_id" };

    const record = await step.run("load-record", async () => {
      const { data } = await supabase
        .from("pattern_records")
        .select(PRECEDENCE_COLUMNS)
        .eq("id", recordId)
        .maybeSingle();
      return (data ?? null) as PrecedenceSourceRow | null;
    });
    if (!record) return { skipped: "record not found", recordId };
    if (record.precedence_checked_at) return { skipped: "already checked", recordId };

    const result = await step.run("extract", async () => extractForRecord(record));
    return { recordId, ...result };
  }
);

export const backfillPrecedenceJob = inngest.createFunction(
  { id: "precedence-backfill", retries: 1 },
  { event: "precedence/backfill" },
  async ({ event, step }) => {
    const orgId = event.data?.org_id as string | undefined;
    if (!orgId) return { skipped: "org_id is required" };

    const records = await step.run("load-unchecked", async () => {
      const { data } = await supabase
        .from("pattern_records")
        .select(PRECEDENCE_COLUMNS)
        .eq("org_id", orgId)
        .eq("status", "complete")
        .is("precedence_checked_at", null)
        .order("created_at", { ascending: true });
      return (data ?? []) as unknown as PrecedenceSourceRow[];
    });

    let stated = 0;
    let implied = 0;
    let failed = 0;
    for (const record of records) {
      // One step per record: each is independently retryable and a single model
      // hiccup never re-runs the whole pass.
      const r = await step.run(`extract-${record.id}`, async () => extractForRecord(record));
      stated += r.stated;
      implied += r.implied;
      if (!r.ok) failed++;
    }

    return { orgId, considered: records.length, stated, implied, failed };
  }
);

export const precedenceFunctions = [extractPrecedenceJob, backfillPrecedenceJob];
