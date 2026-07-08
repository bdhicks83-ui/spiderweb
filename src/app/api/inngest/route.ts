// Inngest endpoint — background jobs get served from here.
import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { functions } from "@/inngest/functions";

// Large PDFs run many chunked steps; give each Inngest invocation the max
// serverless budget (capped by the Vercel plan). Chunking keeps individual
// steps short, but this is the safety ceiling.
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({ client: inngest, functions });
