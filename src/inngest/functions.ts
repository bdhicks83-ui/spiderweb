// Background processing — Week 3.
// Flow: source uploaded → extract text (if image) → extract insights → rows in `insights`.
import { inngest } from "./client";

export const processSource = inngest.createFunction(
  { id: "process-source" },
  { event: "source/uploaded" },
  async ({ event, step }) => {
    const { sourceId } = event.data as { sourceId: string };

    // TODO Week 3:
    // 1. step.run("load-source") — fetch source row + file from Storage
    // 2. step.run("extract-text") — claude.extractText() if kind === 'screenshot'
    // 3. step.run("extract-insights") — claude.extractInsights(rawText)
    // 4. step.run("save-insights") — insert rows, set source.status = 'processed'
    // On failure: set source.status = 'failed' + error message (Week 4 polish)

    return { sourceId, status: "stub — implement in Week 3" };
  }
);

export const functions = [processSource];
