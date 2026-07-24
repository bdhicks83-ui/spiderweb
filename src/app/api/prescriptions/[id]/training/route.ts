// P-4B Builds 3 + 6 — training generation (3 audience altitudes) and
// regenerate-on-request.
//
// POST { regenerate?: boolean, note?: string }
//
// Generate (first version) requires:
//   • status 'approved' (the manager gate has passed)
//   • NOT capture-first (nothing authored yet ⇒ nothing to build from —
//     the honest doctrine: the prescription IS "go capture")
//   • EVERY named expert has a CONFIRMED fidelity row — nothing ships in an
//     expert's name without "yes, that's how I think"
//
// Regenerate requires an existing version and produces a VISIBLY different
// strategy (prompt-enforced + label-checked); the prior version stays —
// history is never overwritten. A regenerate re-delivers: delivered_at
// resets and the efficacy loop's watch restarts (that's the retry in
// "training that verifies itself and retries when it fails").
//
// Grounding doctrine: the artifact is built ONLY from the paired expert
// framework record(s) in prescriptions.experts — same no-outside-knowledge
// rule as /retrieve and Ask Your Spiderweb. Prompts load from /prompts.
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { generateTraining, regenerateTraining } from "@/lib/claude";
import {
  RUNG_FORMAT,
  PRESCRIPTION_RECORD_COLUMNS,
  formatFrameworksForTraining,
  type PrescriptionSourceRecord,
} from "@/lib/prescription";

type RxRow = {
  id: string;
  org_id: string;
  detection_id: string;
  rung: number;
  gap_summary: string;
  experts: { user_id: string; record_id: string }[];
  capture_first: boolean;
  audience: string;
  pairing_summary: string;
  status: string;
};

type FidelityRow = {
  expert_user_id: string;
  decision: string;
  note: string | null;
};

type TrainingRow = {
  version: number;
  strategy: string;
  title: string;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const regenerate = body?.regenerate === true;
    const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim() : null;

    const supabase = await createSessionClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    const { data: rxRaw } = await supabase
      .from("prescriptions")
      .select(
        "id, org_id, detection_id, rung, gap_summary, experts, capture_first, audience, pairing_summary, status"
      )
      .eq("id", id)
      .maybeSingle();
    const rx = rxRaw as unknown as RxRow | null;
    if (!rx) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // ── Guard: capture-first has nothing to generate from ──
    if (rx.capture_first) {
      return NextResponse.json(
        {
          error:
            "Capture first — nobody has codified this territory, so there is no expert framework to build training from. Run the elicitation sessions the pairing names; the training comes after the capture.",
        },
        { status: 409 }
      );
    }
    if ((rx.experts || []).length === 0) {
      // The DB check constraint makes this unreachable, but never generate
      // from nothing.
      return NextResponse.json({ error: "No expert frameworks to build from" }, { status: 409 });
    }

    // ── Guard: right status for the action ──
    if (!regenerate && rx.status !== "approved") {
      return NextResponse.json(
        {
          error:
            rx.status === "open" || rx.status === "snoozed"
              ? "Training generates only after the manager gate — approve this prescription first."
              : `Training already generated (status '${rx.status}') — use regenerate for a different design.`,
        },
        { status: 409 }
      );
    }
    if (regenerate && rx.status !== "delivered") {
      return NextResponse.json(
        { error: `Regenerate needs an already-delivered training (status is '${rx.status}')` },
        { status: 409 }
      );
    }

    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // ── Guard: EVERY named expert has confirmed fidelity ──
    const { data: fidelityRaw } = await service
      .from("prescription_fidelity")
      .select("expert_user_id, decision, note")
      .eq("prescription_id", rx.id);
    const fidelity = (fidelityRaw || []) as unknown as FidelityRow[];
    const decisionFor = new Map(fidelity.map((f) => [f.expert_user_id, f]));
    const rejected = (rx.experts || []).filter(
      (e) => decisionFor.get(e.user_id)?.decision === "rejected"
    );
    const unconfirmed = (rx.experts || []).filter(
      (e) => decisionFor.get(e.user_id)?.decision !== "confirmed"
    );
    if (rejected.length > 0 || unconfirmed.length > 0) {
      // Resolve display names for an honest, human error.
      const ids = [...new Set(unconfirmed.map((e) => e.user_id))];
      const { data: profs } = await service
        .from("profiles")
        .select("id, display_name")
        .in("id", ids);
      const nameFor = new Map(
        ((profs || []) as { id: string; display_name: string | null }[]).map((p) => [
          p.id,
          p.display_name ?? "an org expert",
        ])
      );
      const rejectedNote = rejected
        .map((e) => decisionFor.get(e.user_id)?.note)
        .filter(Boolean)
        .join(" · ");
      return NextResponse.json(
        {
          error:
            rejected.length > 0
              ? `An authoring expert said "not quite" — nothing ships in their name. Their note: ${rejectedNote || "(none)"}`
              : `Waiting on the fidelity check from: ${ids.map((i) => nameFor.get(i)).join(", ")}. Nothing ships in an expert's name without their confirm.`,
          waiting_on: ids,
        },
        { status: 409 }
      );
    }

    // ── Load the grounding frameworks + detection source type ──
    const recordIds = [...new Set((rx.experts || []).map((e) => e.record_id))];
    const { data: recRaw, error: recError } = await service
      .from("pattern_records")
      .select(PRESCRIPTION_RECORD_COLUMNS)
      .eq("org_id", rx.org_id)
      .in("id", recordIds);
    if (recError) {
      return NextResponse.json({ error: recError.message }, { status: 500 });
    }
    const records = (recRaw || []) as unknown as PrescriptionSourceRecord[];
    if (records.length === 0) {
      return NextResponse.json(
        { error: "The expert framework record(s) could not be loaded" },
        { status: 500 }
      );
    }

    const authorIds = [...new Set(records.map((r) => r.user_id))];
    const { data: authorProfs } = await service
      .from("profiles")
      .select("id, display_name")
      .in("id", authorIds);
    const authorNames = new Map(
      ((authorProfs || []) as { id: string; display_name: string | null }[]).map((p) => [
        p.id,
        p.display_name ?? "an org expert",
      ])
    );
    const authorName = (uid: string) => authorNames.get(uid) ?? "an org expert";

    const { data: detRaw } = await service
      .from("prescription_detections")
      .select("source_type")
      .eq("id", rx.detection_id)
      .maybeSingle();
    const sourceType = (detRaw as { source_type?: string } | null)?.source_type ?? "unknown";

    const format = RUNG_FORMAT[rx.rung] ?? RUNG_FORMAT[2];
    const frameworks = formatFrameworksForTraining(records, authorName);

    // ── Prior versions (history is never overwritten) ──
    const { data: priorRaw } = await service
      .from("prescription_trainings")
      .select("version, strategy, title")
      .eq("prescription_id", rx.id)
      .order("version", { ascending: false });
    const prior = (priorRaw || []) as unknown as TrainingRow[];

    if (regenerate && prior.length === 0) {
      return NextResponse.json(
        { error: "Nothing to regenerate — generate the first version first." },
        { status: 409 }
      );
    }

    // ── Generate ──
    const input = {
      rung: rx.rung,
      formatName: format.name,
      formatInstructions: format.instructions,
      sourceType,
      gapSummary: rx.gap_summary,
      pairingSummary: rx.pairing_summary,
      audience: rx.audience,
      frameworks,
    };
    const artifact = regenerate
      ? await regenerateTraining({
          ...input,
          priorVersions: prior.map((p) => ({
            version: p.version,
            strategy: p.strategy,
            title: p.title,
          })),
          regenerateNote: note,
        })
      : await generateTraining(input);
    if (!artifact) {
      // Fail open, P-4A style: nothing half-built is stored; the caller can
      // simply try again.
      return NextResponse.json(
        { error: "The training generator flaked — nothing was stored. Try again." },
        { status: 502 }
      );
    }

    const version = (prior[0]?.version ?? 0) + 1;
    const { data: inserted, error: insError } = await service
      .from("prescription_trainings")
      .insert({
        org_id: rx.org_id,
        prescription_id: rx.id,
        version,
        strategy: artifact.strategy,
        rung: rx.rung,
        format: format.name,
        title: artifact.title,
        altitudes: artifact.altitudes,
        regenerate_note: regenerate ? note : null,
      })
      .select("id, version")
      .single();
    if (insError) {
      return NextResponse.json({ error: insError.message }, { status: 500 });
    }

    // ── Deliver (or re-deliver): the efficacy watch (re)starts now ──
    const { error: updError } = await service
      .from("prescriptions")
      .update({
        status: "delivered",
        delivered_at: new Date().toISOString(),
        efficacy_status: "watching",
        efficacy_note: regenerate
          ? `Watching — redesigned as v${version} ("${artifact.strategy}"); the post-delivery watch restarted.`
          : null,
        efficacy_evidence_record_ids: [],
        efficacy_checked_at: null,
      })
      .eq("id", rx.id);
    if (updError) {
      return NextResponse.json({ error: updError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      training: {
        id: (inserted as { id: string }).id,
        version,
        strategy: artifact.strategy,
        title: artifact.title,
      },
      message: regenerate
        ? `Redesigned — v${version} uses a different strategy ("${artifact.strategy}"). Prior versions are kept.`
        : `Training generated in 3 audience altitudes and delivered. The efficacy loop is now watching.`,
    });
  } catch (err) {
    console.error("Unexpected error in prescription training route:", err);
    const message = err instanceof Error ? err.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
