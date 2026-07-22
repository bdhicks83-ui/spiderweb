// P-0 acceptance harness: prove the framework renders on the FIRST try.
//
// This exercises the exact unit that was flaking — the framePattern render
// pipeline (prompt -> claude-sonnet-5 -> parse -> validate). For each of N
// varied *complete* Pattern Records it makes ONE call with NO retry and checks
// whether a valid FrameworkArtifact comes back on that first attempt. That is
// precisely what /api/codify/answer's completeRecord() does inline, so a green
// run here means the codify session's framework card renders without the retry
// path.
//
// It runs two pipelines on the same records:
//   NEW  = max_tokens 3072 + parseJsonLoose  (the hardened path now in claude.ts)
//   OLD  = max_tokens 1536 + strict parseJson (the previous path, for evidence)
//
// firstText / parseJson / parseJsonLoose / isFrameworkArtifact below are copied
// VERBATIM from src/lib/claude.ts + src/lib/elicitation.ts.
//
// Usage: node scripts/codify-smoke.mjs
import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "node:fs/promises";
import path from "node:path";

// ─── env ───
const envRaw = await readFile(path.join(process.cwd(), ".env.local"), "utf-8");
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const anthropic = new Anthropic();

// ─── verbatim from claude.ts ───
function firstText(content) {
  const block = content.find((b) => b.type === "text");
  return block?.text ?? "";
}
function parseJson(text) {
  try {
    return JSON.parse(text.replace(/^```json?\n?|```$/g, "").trim());
  } catch {
    return null;
  }
}
function parseJsonLoose(text) {
  const direct = parseJson(text);
  if (direct !== null) return direct;
  const stripped = text.replace(/^```json?\n?|```$/g, "").trim();
  const start = stripped.search(/[{[]/);
  if (start === -1) return null;
  const open = stripped[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < stripped.length; i++) {
    const ch = stripped[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(stripped.slice(start, i + 1)); }
        catch { return null; }
      }
    }
  }
  return null;
}
// verbatim from elicitation.ts
function isFrameworkArtifact(v) {
  if (!v || typeof v !== "object") return false;
  const f = v;
  const isStrArr = (x) => Array.isArray(x) && x.length > 0 && x.every((s) => typeof s === "string");
  return (
    typeof f.name === "string" &&
    typeof f.tagline === "string" &&
    isStrArr(f.when_to_apply) &&
    isStrArr(f.signals) &&
    typeof f.the_play === "string" &&
    typeof f.why_it_works === "string" &&
    isStrArr(f.boundaries)
  );
}
function formatRecordState(fields) {
  return JSON.stringify(fields, null, 2);
}

// ─── the frame-pattern prompt (same file the route loads) ───
const promptTemplate = await readFile(
  path.join(process.cwd(), "prompts", "frame-pattern.md"),
  "utf-8"
);
const buildPrompt = (fields) =>
  promptTemplate.replaceAll("{{record}}", formatRecordState(fields));

// ─── 10 varied COMPLETE Pattern Records (roles, not names) ───
const RECORDS = [
  {
    context_summary: "Head of Ops at a ~150-person food distribution firm restructured a chronically late night-shift loading dock.",
    context_org_size: "50-200", context_industry: "Distribution", context_function: "Ops",
    situation_type: "Process failure", intervention_type: "Re-sequence",
    trigger_signal: "Outbound trucks left 40-90 minutes late almost every night despite the crew clocking in on time and headcount being adequate.",
    signal_detail: "The delay wasn't labor — it was a hidden serial dependency. The shift lead staged every pallet himself before anyone could load, so 11 loaders stood idle for the first hour. On the floor you could see people waiting on one man with a clipboard; the bottleneck moved with him, not with the volume.",
    judgment: "Split staging from loading: pre-stage the manifest during the prior shift and let two senior loaders stage their own lanes in parallel rather than routing everything through the lead.",
    rationale: "The lead was the single point of serialization; adding loaders had never helped because they all queued behind him. Parallelizing the staging step removed the dependency instead of throwing bodies at a labor problem that wasn't a labor problem.",
    boundaries: "This fails when staging genuinely requires one trusted set of eyes — e.g. high-value or regulated cold-chain loads where a miss-stage means spoilage or a compliance violation. There, the serial checkpoint is the control, not the waste, and parallelizing just moves the error rate up.",
  },
  {
    context_summary: "Interim CFO at a 400-person manufacturer killed a planned ERP upgrade weeks before go-live.",
    context_org_size: "200-1000", context_industry: "Manufacturing", context_function: "Finance",
    situation_type: "Systems", intervention_type: "Remove",
    trigger_signal: "The upgrade was 'on track' on every status deck, but no one on the shop floor could describe how they'd close month-end in the new system.",
    signal_detail: "The tell was the language. In steering meetings people talked about modules and cutover dates; on the floor, the AP and inventory clerks talked about workarounds they'd 'figure out later.' When the people who actually key transactions can't narrate the new daily flow, the project is decorated, not ready.",
    judgment: "Halt the go-live, run a parallel-close pilot on one plant for a full month before any cutover.",
    rationale: "A big-bang cutover with no rehearsed close is a bet you can't unwind mid-month. A one-plant parallel run surfaces the workaround debt while it's still cheap, and buys credibility for the eventual switch instead of a heroic recovery.",
    boundaries: "Don't do this if the legacy system is actually failing — losing data or unsupported — because then delay is the bigger risk and a rough cutover beats no system. The pilot-first call assumes the old system can safely carry you another quarter.",
  },
  {
    context_summary: "VP People at a ~90-person services firm chose not to backfill a departing 'indispensable' senior manager.",
    context_org_size: "50-200", context_industry: "Services", context_function: "HR/People",
    situation_type: "Headcount/structure", intervention_type: "Consolidate",
    trigger_signal: "A well-liked senior manager resigned and three directors independently said the team 'couldn't function' without an immediate like-for-like replacement.",
    signal_detail: "What I actually saw was that the role had accreted glue-work, not decisions. Their calendar was 80% status meetings they'd created; the real judgment calls already lived with two ICs who quietly pre-decided everything before the manager 'approved' it. The panic was about the meetings disappearing, not capability disappearing.",
    judgment: "Don't backfill. Promote the two ICs into ownership of their lanes and delete the status layer entirely.",
    rationale: "Backfilling would have re-created the glue-work and buried the two people already doing the thinking. Removing the layer tests whether the role was structural or ceremonial — and here it was ceremonial.",
    boundaries: "This backfires when the departing person was the actual escalation path for cross-team conflict, not just a meeting host. If removing them leaves no one with the authority to break ties, you get gridlock, and you should backfill fast.",
  },
  {
    context_summary: "Quality lead at a 600-person medical-device maker rejected a supplier's cheaper resin despite passing spec sheets.",
    context_org_size: "200-1000", context_industry: "Healthcare", context_function: "Quality",
    situation_type: "Cost", intervention_type: "Remove",
    trigger_signal: "Procurement pushed a 22% cheaper resin that met every listed material spec and had valid certs.",
    signal_detail: "The spec sheet matched, but the certificate of analysis showed a different regrind ratio and a supplier plant I didn't recognize. In devices, a spec-equivalent material from an unqualified process line is not the same material — the risk lives in the process history the spec sheet doesn't capture, and that CoA was quietly telling me the process had changed.",
    judgment: "Reject the switch until the new plant runs a full requalification, even though it delays the cost saving by a quarter.",
    rationale: "Material equivalence on paper isn't process equivalence in a regulated build. The cost saving is real but bounded; a field failure traced to an unqualified process line is unbounded — recalls, FDA, patient harm.",
    boundaries: "This caution is wrong for a non-critical, non-patient-contact component where the spec truly is the whole story. Requalifying a cosmetic bracket to this standard just burns quarters and goodwill for risk that isn't there.",
  },
  {
    context_summary: "Ops director at a ~1,200-person retailer overruled a data team's recommendation to close the lowest-margin region.",
    context_org_size: "1000+", context_industry: "Distribution", context_function: "Leadership",
    situation_type: "Cost", intervention_type: "Restructure",
    trigger_signal: "A clean analysis flagged one region as the worst gross-margin performer and recommended exit.",
    signal_detail: "The margin was real but the read was backwards. That region carried the returns processing and slow-moving overflow for three profitable regions — its cost sat on its own P&L while the benefit showed up elsewhere. The number looked like a bad region; on the ground it was a shared service being blamed for absorbing everyone else's mess.",
    judgment: "Keep the region open but re-charge its returns/overflow costs back to the regions that generate them, then re-evaluate.",
    rationale: "You can't cut a cost center by looking only at its local P&L when it's subsidizing others. Fixing the allocation reveals the true standalone economics before you make an irreversible closure decision.",
    boundaries: "If the region really is standalone — no shared services, no cross-subsidy — then the data team is right and this hesitation just protects a loser. The re-charge move only applies when hidden cross-subsidy is actually present.",
  },
  {
    context_summary: "Turnaround consultant at an 1,800-person manufacturer slowed a layoff the board wanted done in a week.",
    context_org_size: "1000+", context_industry: "Manufacturing", context_function: "Leadership",
    situation_type: "Talent", intervention_type: "Restructure",
    trigger_signal: "The board wanted a 15% RIF executed immediately and uniformly across all functions.",
    signal_detail: "A uniform cut ignored that two functions were already below replacement capacity — maintenance and scheduling. I could see it in the overtime logs: those teams were carrying 30% OT for six months straight, which is a team running hot, not a team with slack. Cutting there wasn't trimming fat, it was pulling load-bearing walls.",
    judgment: "Do the 15% by dollar target, not headcount uniformity — exempt the two hot functions and take deeper cuts where slack actually existed.",
    rationale: "Uniform cuts feel fair but optimize for optics, not survival. Hitting the same savings while protecting the two functions that keep the plant running preserves the capacity you'd have to rehire at a premium in three months.",
    boundaries: "This doesn't apply when the hot functions are hot because of fixable process waste, not real demand — then protecting them just protects the waste. You have to confirm the overtime is structural before you exempt anyone.",
  },
  {
    context_summary: "Head of Supply Chain at a ~250-person distributor double-sourced a single-supplier component before any shortage appeared.",
    context_org_size: "200-1000", context_industry: "Distribution", context_function: "Supply chain",
    situation_type: "Systems", intervention_type: "Add",
    trigger_signal: "A key component came from one supplier who was reliable, cheap, and had never missed — so no one saw a problem.",
    signal_detail: "The signal was in how the supplier talked about their own business: they'd stopped mentioning new capacity investment and started talking about 'focusing on core customers.' That's the language of a firm quietly deciding who to drop when constrained. Perfect delivery history hid a supplier who was already mentally rationing.",
    judgment: "Qualify a second source immediately and give them a small standing order, accepting a slightly higher blended cost.",
    rationale: "The cost of a second source is small and known; the cost of discovering you're the customer they dropped — mid-season, with no qualified alternative — is a stockout you can't fix fast. You buy the option before you need it.",
    boundaries: "Skip this for commodity parts with a deep spot market — there, re-sourcing overnight is trivial and paying to pre-qualify a second source is waste. The move only earns its cost when the part is specialized and lead-times are long.",
  },
  {
    context_summary: "Culture lead at a ~120-person services firm stopped a popular 'unlimited PTO' rollout.",
    context_org_size: "50-200", context_industry: "Services", context_function: "HR/People",
    situation_type: "Culture", intervention_type: "Remove",
    trigger_signal: "Leadership wanted to launch unlimited PTO as a recruiting perk; early employee sentiment was enthusiastic.",
    signal_detail: "The enthusiasm was loudest from the people who already took the least time off — the anxious high performers. In this firm's culture, ambiguity around time off doesn't read as freedom, it reads as a test. I'd watched the same population interpret 'flexible hours' as 'always available.' Unlimited PTO here would quietly lower real days taken, not raise them.",
    judgment: "Replace the unlimited plan with a generous fixed allotment plus a *mandatory* minimum days-taken floor.",
    rationale: "In a high-anxiety, high-performer culture the binding constraint isn't the cap, it's permission. A mandatory floor gives explicit cover to rest; 'unlimited' removes the cap but also the permission, and burnout gets worse under a perk that looks generous.",
    boundaries: "This is wrong in a culture that already over-takes or games leave — there a floor is pointless and unlimited genuinely simplifies admin. The read depends on the existing norm being under-resting, not over-resting.",
  },
  {
    context_summary: "Fractional COO at a ~700-person healthcare services org re-skilled a call-center team instead of outsourcing it.",
    context_org_size: "200-1000", context_industry: "Healthcare", context_function: "Ops",
    situation_type: "Talent", intervention_type: "Re-skill",
    trigger_signal: "The patient-scheduling call center had rising costs and long hold times; the obvious fix on the table was outsourcing to a BPO.",
    signal_detail: "The hold times weren't a staffing problem — they were a knowledge problem. Agents kept transferring calls because only two veterans knew the insurance-authorization edge cases, so everything hard funneled to two people. You could see it in the transfer logs: 60% of long calls hit the same two extensions. Outsourcing would have exported the easy calls and left the hard core even more concentrated.",
    judgment: "Keep it in-house but build the two veterans' tacit auth knowledge into a decision tool and cross-train the floor on it.",
    rationale: "The cost driver was concentration of tacit knowledge, not wage rates. Codifying the edge cases spreads the capability and cuts transfers; outsourcing the volume would have left the expensive, regulated core unsolved and harder to reach.",
    boundaries: "If the call center's work were genuinely commodity and low-variance, the BPO math wins and this in-house re-skill is sentimental. The call hinges on the work having a real tacit core worth keeping.",
  },
  {
    context_summary: "Plant GM at a ~350-person manufacturer measured a new safety program by near-miss reports going UP, not down.",
    context_org_size: "200-1000", context_industry: "Manufacturing", context_function: "Quality",
    situation_type: "Process failure", intervention_type: "Measure",
    trigger_signal: "After a safety overhaul, leadership wanted to declare success because recordable incidents dropped in the first quarter.",
    signal_detail: "Recordables dropping that fast, that early, is usually reporting fear, not real safety — people stop logging when they think the program is a crackdown. The real leading indicator I watched was near-miss reports: those should climb first, because a healthy program makes people comfortable reporting the almost-happened. Flat near-misses with falling recordables is a silence, not a win.",
    judgment: "Set the near-miss report rate as the program's headline metric for the first two quarters and explicitly reward reporting.",
    rationale: "Lagging indicators like recordables can drop for the wrong reason (suppression). A rising near-miss rate proves the reporting culture is alive, which is the mechanism that actually prevents the serious event later.",
    boundaries: "This inverts once the program is mature — sustained high near-miss rates then signal a floor that isn't improving, and you do want them trending down. Rewarding reporting forever eventually just rewards noise.",
  },
];

async function callFrame(fields, { maxTokens, loose }) {
  const prompt = buildPrompt(fields);
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  });
  const text = firstText(msg.content);
  const parsed = loose ? parseJsonLoose(text) : parseJson(text);
  const ok = isFrameworkArtifact(parsed);
  return { ok, stop: msg.stop_reason, outTokens: msg.usage?.output_tokens, name: ok ? parsed.name : null };
}

// Deterministic parser proof: model wraps JSON in a one-line preamble.
function parserProof() {
  const wrapped = 'Here is the framework:\n{"name":"X","tagline":"t","when_to_apply":["a"],"signals":["s"],"the_play":"p","why_it_works":"w","boundaries":["b"]}\nHope that helps!';
  return {
    old: isFrameworkArtifact(parseJson(wrapped)),
    new: isFrameworkArtifact(parseJsonLoose(wrapped)),
  };
}

async function run() {
  console.log("=== Deterministic parser proof (preamble-wrapped JSON) ===");
  const proof = parserProof();
  console.log(`  OLD strict parseJson : ${proof.old ? "PASS" : "FAIL"}`);
  console.log(`  NEW parseJsonLoose   : ${proof.new ? "PASS" : "FAIL"}`);
  console.log("");

  let newPass = 0, oldPass = 0;
  console.log("=== 10 records x first-try render (NO retry) ===");
  for (let i = 0; i < RECORDS.length; i++) {
    const r = RECORDS[i];
    // NEW hardened path
    let neu;
    try { neu = await callFrame(r, { maxTokens: 3072, loose: true }); }
    catch (e) { neu = { ok: false, stop: "THREW:" + (e?.message || e) }; }
    // OLD path (evidence)
    let old;
    try { old = await callFrame(r, { maxTokens: 1536, loose: false }); }
    catch (e) { old = { ok: false, stop: "THREW:" + (e?.message || e) }; }

    if (neu.ok) newPass++;
    if (old.ok) oldPass++;
    console.log(
      `#${String(i + 1).padStart(2)}  NEW ${neu.ok ? "OK " : "XXX"} ` +
      `(stop=${neu.stop}, out=${neu.outTokens})  |  ` +
      `OLD ${old.ok ? "OK " : "XXX"} (stop=${old.stop}, out=${old.outTokens})` +
      (neu.name ? `  -> "${neu.name}"` : "")
    );
  }
  console.log("");
  console.log(`NEW hardened path: ${newPass}/${RECORDS.length} first-try renders`);
  console.log(`OLD path        : ${oldPass}/${RECORDS.length} first-try renders`);
  console.log(newPass === RECORDS.length ? "RESULT: PASS ✅ (10/10, zero retries)" : "RESULT: FAIL ❌");
}

run().catch((e) => { console.error(e); process.exit(1); });
