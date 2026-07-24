// P-4B Build 4 — the teach-back check (retrieval practice).
//
// POST { action: 'start' }                        → generate a FRESH scenario
// POST { action: 'submit', teachback_id, answer } → score the answer
//
// After training, the engine generates a NEW scenario from the framework's
// signal/play/boundaries — never a restatement of the training's own
// examples — and the learner answers "what would you do?". A model call
// scores the answer against the framework (signal 40 + play 40 +
// boundaries 20; pass ≥ TEACHBACK_PASS_SCORE). Completion + score are
// stored and sit alongside the efficacy loop: teach-back is the Kirkpatrick
// L2 evidence next to the loop's automatic L4.
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { generateTeachbackScenario, scoreTeachback } from "@/lib/claude";
import {
  PRESCRIPTION_RECORD_COLUMNS,
  TEACHBACK_PASS_SCORE,
  formatFrameworksForTraining,
  type PrescriptionSourceRecord,
} from "@/lib/prescription";

type RxRow = {
  id: string;
  org_id: string;
  status: string;
  audience: string;
  experts: { user_id: string; record_id: string }[];
};

type TrainingRow = { id: string; version: number; strategy: string; title: string };

type TeachbackRow = {
  id: string;
  prescription_id: string;
  learner_user_id: string;
  scenario: string;
  question: string;
  answer: string | null;
};

async function loadFrameworks(
  service: SupabaseClient,
  rx: RxRow
): Promise<string | null> {
  const recordIds = [...new Set((rx.experts || []).map((e) => e.record_id))];
  if (recordIds.length === 0) return null;
  const { data: recRaw } = await service
    .from("pattern_records")
    .select(PRESCRIPTION_RECORD_COLUMNS)
    .eq("org_id", rx.org_id)
    .in("id", recordIds);
  const records = (recRaw || []) as unknown as PrescriptionSourceRecord[];
  if (records.length === 0) return null;
  const authorIds = [...new Set(records.map((r) => r.user_id))];
  const { data: profs } = await service
    .from("profiles")
    .select("id, display_name")
    .in("id", authorIds);
  const names = new Map(
    ((profs || []) as { id: string; display_name: string | null }[]).map((p) => [
      p.id,
      p.display_name ?? "an org expert",
    ])
  );
  return formatFrameworksForTraining(records, (uid) => names.get(uid) ?? "an org expert");
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    const supabase = await createSessionClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    const { data: rxRaw } = await supabase
      .from("prescriptions")
      .select("id, org_id, status, audience, experts")
      .eq("id", id)
      .maybeSingle();
    const rx = rxRaw as unknown as RxRow | null;
    if (!rx) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    if (action === "start") {
      if (rx.status !== "delivered" && rx.status !== "closed") {
        return NextResponse.json(
          { error: "Teach-back runs after training is delivered." },
          { status: 409 }
        );
      }
      const { data: trainRaw } = await service
        .from("prescription_trainings")
        .select("id, version, strategy, title")
        .eq("prescription_id", rx.id)
        .order("version", { ascending: false })
        .limit(1);
      const training = ((trainRaw || []) as unknown as TrainingRow[])[0];
      if (!training) {
        return NextResponse.json({ error: "No training exists yet." }, { status: 409 });
      }
      const frameworks = await loadFrameworks(service, rx);
      if (!frameworks) {
        return NextResponse.json(
          { error: "The framework record(s) could not be loaded" },
          { status: 500 }
        );
      }
      const scenario = await generateTeachbackScenario(
        frameworks,
        rx.audience,
        training.title,
        training.strategy
      );
      if (!scenario) {
        return NextResponse.json(
          { error: "The scenario generator flaked — nothing was stored. Try again." },
          { status: 502 }
        );
      }
      const { data: inserted, error: insError } = await service
        .from("prescription_teachbacks")
        .insert({
          org_id: rx.org_id,
          prescription_id: rx.id,
          training_id: training.id,
          learner_user_id: user.id,
          scenario: scenario.scenario,
          question: scenario.question,
        })
        .select("id, scenario, question")
        .single();
      if (insError) {
        return NextResponse.json({ error: insError.message }, { status: 500 });
      }
      return NextResponse.json({
        success: true,
        teachback: inserted,
        message: "Fresh scenario generated — answer in your own words: what would you do?",
      });
    }

    if (action === "submit") {
      const teachbackId = typeof body?.teachback_id === "string" ? body.teachback_id : null;
      const answer = typeof body?.answer === "string" ? body.answer.trim() : "";
      if (!teachbackId || !answer) {
        return NextResponse.json(
          { error: "submit requires teachback_id and a non-empty answer" },
          { status: 400 }
        );
      }
      // Load through the SESSION client — org RLS scopes it.
      const { data: tbRaw } = await supabase
        .from("prescription_teachbacks")
        .select("id, prescription_id, learner_user_id, scenario, question, answer")
        .eq("id", teachbackId)
        .maybeSingle();
      const tb = tbRaw as unknown as TeachbackRow | null;
      if (!tb || tb.prescription_id !== rx.id) {
        return NextResponse.json({ error: "Teach-back not found" }, { status: 404 });
      }
      if (tb.learner_user_id !== user.id) {
        return NextResponse.json(
          { error: "Only the learner who started this teach-back can answer it." },
          { status: 403 }
        );
      }
      if (tb.answer) {
        return NextResponse.json(
          { error: "This teach-back was already answered — start a new one." },
          { status: 409 }
        );
      }
      const frameworks = await loadFrameworks(service, rx);
      if (!frameworks) {
        return NextResponse.json(
          { error: "The framework record(s) could not be loaded" },
          { status: 500 }
        );
      }
      const result = await scoreTeachback(frameworks, tb.scenario, tb.question, answer);
      if (!result) {
        return NextResponse.json(
          { error: "The scorer flaked — your answer was not stored. Try submitting again." },
          { status: 502 }
        );
      }
      const passed = result.score >= TEACHBACK_PASS_SCORE;
      const { error: updError } = await service
        .from("prescription_teachbacks")
        .update({
          answer,
          score: result.score,
          passed,
          feedback: result.feedback,
          missed: result.missed,
          completed_at: new Date().toISOString(),
        })
        .eq("id", tb.id);
      if (updError) {
        return NextResponse.json({ error: updError.message }, { status: 500 });
      }
      return NextResponse.json({
        success: true,
        score: result.score,
        passed,
        feedback: result.feedback,
        missed: result.missed,
        message: passed
          ? `Scored ${result.score}/100 — the framework transferred.`
          : `Scored ${result.score}/100 — below the ${TEACHBACK_PASS_SCORE} pass line. The feedback names what the framework says; run another teach-back after a re-read.`,
      });
    }

    return NextResponse.json({ error: "action must be 'start' or 'submit'" }, { status: 400 });
  } catch (err) {
    console.error("Unexpected error in prescription teachback route:", err);
    const message = err instanceof Error ? err.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
