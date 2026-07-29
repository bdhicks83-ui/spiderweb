// TIER 1 / BUILD 3 — the readout as a downloadable PDF.
//
// GET ?since=YYYY-MM-DD → application/pdf.
//
// ⭐ THIS IS THE ARTIFACT THE PILOT TURNS ON. Nobody renews because a dashboard
// looked good; they renew because a champion forwarded two pages to the person
// who signs. Same serverless-safe @react-pdf/renderer path as the framework and
// resume exports — no Chromium, no Remotion, nothing that dies on Vercel.
//
// Nothing is stored. The PDF renders fresh from live rows each time, which is
// also why no snapshot table exists: the dated file IS the snapshot.
//
// ⚠️ NO PII SCRUB HERE, and that is deliberate rather than an omission. The
// framework export runs scrubForExport() because a framework is free prose that
// may name a client or an individual. This document contains no prose from a
// record — only counts, the org's own name, and the names of its own people
// shown for what they CONTRIBUTED. The two open-question strings it does print
// are the org's own typed questions, going back to the org. A model call in
// this path would add latency and a failure mode for no safety gain.
import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { buildReadout, requireReadoutViewer } from "@/lib/value-readout";
import { ReadoutDocument } from "@/lib/readout-pdf";

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "organization"
  );
}

export async function GET(req: NextRequest) {
  try {
    const session = await createSessionClient();
    const gate = await requireReadoutViewer(session);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error, code: gate.code }, { status: gate.status });
    }

    const raw = req.nextUrl.searchParams.get("since");
    const since =
      raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00Z`).toISOString() : null;

    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const readout = await buildReadout(service, gate.orgId, since);

    // Called as a plain function, not as JSX — this is a .ts route file, and it
    // mirrors how /api/codify/pdf and /api/generate-resume already do it. Using
    // JSX here would force the file to .tsx for no benefit.
    const buffer = await renderToBuffer(ReadoutDocument({ readout }));
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `${slugify(readout.org_name)}-readout-${stamp}.pdf`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        // Never cache a document whose whole point is being current.
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("Unexpected error in readout PDF route:", err);
    return NextResponse.json(
      {
        error: "Could not build the PDF.",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
