# ⚠️ COPY DRAFT — Exposure + The Ledger (v2.60)

**Everything in this file is DRAFT and ships as DRAFT. Nothing customer-facing is final until you sign off.**
Organized by surface. Every string below is live in the build behind a `⚠️ DRAFT` comment block.

Voice rules applied throughout: opportunity framing never loss framing · land the punch once, never repeat · recognition over gatekeeping · short rhythmic sentences · gender-neutral (silently corrected).

---

## ✅ DECIDED 2026-08-06 — all five, built and typechecking

| # | Call | Your answer | What changed in code |
|---|---|---|---|
| 1 | Nav label for `/exposure` | **"What's at risk"** | Page title, denial copy, dashboard card |
| 2 | Customer name for the ledger | **"Value Ledger"** | Section heading on `/readout` |
| 3 | Nav placement | **Fifth card** (sixth dropped — see #4) | Dashboard goes 4 verb cards → 5. Header links removed. |
| 4 | Where the ledger lives | **Fully inside `/readout`** | `/ledger` page **deleted**. Tiers, drill-downs, editable rates and caveats all live on the readout now. |
| 5 | PDF assumptions footnote | **Keep itemized** | Unchanged — every figure stays reproducible by the reader |
| 6 | Readout gate (created by #4) | **Widen to executive seats** | `requireReadoutViewer` now manager · admin · **exec**. Execs can read AND export. |

**One consequence worth naming:** "What's at risk" leans loss framing, which your standing voice rule pushes against. You picked it knowingly, so the code carries a comment saying so — nobody will quietly soften it back to "Coverage" in six months.

**Still open — one thing:** the three extra `value_assumptions` inputs (§6 at the bottom). Keep them, or three of the six event types ship dark.

---

## 1. `/exposure` — the page ("What's at risk")

### Header
- **Title:** ⚠️ What's at risk
- **Subtitle:** "Where your team's judgment is concentrated, and what your own captured frameworks are telling you to watch. Built live from your records. It stays in the building."
- **Not permitted:** "This is for managers, executives, and account admins."
- **No org:** "Once you're part of an organization, this shows up here."
- **Loading:** "Working it out…"

### Block 1 — ⚠️ Walking risk
- **Heading:** ⚠️ Walking risk
- **Lead:** "Judgment that lives in very few heads, ranked by how deep it runs and how often people reach for it. A name here means one thing: this person knows something the team would have to learn again."
- **Empty (good news):** "No concentration risk above the line. Every topic your team has written down has more than one person behind it, or nobody is depending on it yet. That's a good place to be."
- **Empty (nothing captured yet):** "Nothing captured yet, so there's nothing to concentrate. The first framework someone writes down is where this page starts."
- **Show more / less:** "Show all {n}" / "Show fewer"

**Row sentence** — assembled from three parts. ⭐ There is no copy path here that says anything negative about a named person.

> **Line changeover judgment**  · 117
> 4 of 6 answers come from Dana Whitfield (31 years). Nobody else has captured on this. Asked 9 times in 90 days.
> **[Close this →]**  See what's captured  ·  *Opens a capture ask you can send to whoever else should know it.*

- Multi-answer: `"{k} of {n} answers come from {Name} ({y} years)."`
- Single answer: `"The only answer on this comes from {Name} ({y} years)."`
- No second source: `"Nobody else has captured on this."`
- With second sources: `"{k} other answers from {m} people."`
- With demand: `"Asked {n} times in 90 days."`
- No demand: `"Nobody has searched for this in the last 90 days."`
- Years clause is **omitted entirely** when the person hasn't recorded years — never guessed, never implied.

### Block 2 — 🔔 Your own frameworks are warning you
- **Heading:** 🔔 Your own frameworks are warning you
- **Lead:** "Somebody on your team wrote down that one thing leads to another. The first thing is showing up again. This is your judgment talking, not ours."
- **Empty (good news):** "Nothing your captured frameworks predict is showing up right now. Quiet is the right answer here."
- **Unavailable (extraction not switched on):** "Framework warnings aren't switched on for this account yet, so this section can't tell you whether anything is quiet or not."
  - ⭐ Deliberately different from the empty state. An empty list would be claiming "nothing is warning you," which is a claim the page can't honestly make before extraction has run.

**Row:**
> Your captured judgment says **slurry temperature drift** precedes **seal failure on the transfer pump**.
> 3 recent captures mention it.
> *Source: Brian Ng, "Transfer pump seal life," March 2026.*
> **[See the framework →]**

### "What this page can't see"
- **Heading:** What this page can't see
- **Lead:** "Read this before you act on anything above. It's the honest description of the edges."
- "Only your 400 most recent captures are grouped into topics here. Anything older than that is not on this page." *(only when truncated)*
- "{n} captured frameworks haven't been indexed yet, so they aren't grouped into any topic above." *(only when > 0)*
- "Search counts are a floor. Opening a result is optional to record, so real demand is at least this high and probably higher." *(only when some row shows demand)*
- "Years of experience is self-reported. Where a person hasn't filled it in, this page ranks them neutrally and says nothing about their experience." *(only when some row lacks years)*
- "Nothing on this page comes from coaching or performance data. Concentration is a fact about coverage, never about a person." *(only when rows exist)*
- "Framework warnings only fire on judgment somebody stated outright. Anything the model merely inferred is stored and never shown." *(only when warnings are available)*

---

## 2. The Value Ledger — a section ON `/readout` (no page of its own)

Renders directly below the years-of-judgment anchor's card, above "What people asked for."

- **Heading:** 📒 Value Ledger
- **Lead:** "What that judgment cost to acquire, and what it would cost to acquire again. Priced entirely with rates you entered. No saving is claimed anywhere on this page."
- **Not permitted (whole page):** "The readout is for managers, executives, and account admins."

### The three tiers — order and visual weight are load-bearing

| Tier | Label | Lead |
|---|---|---|
| **REALIZED** (loudest, on top, smallest number) | Realized | "Things that measurably happened. Someone said an answer landed; a problem stopped coming back. This is the smallest number here and the one to argue about first." |
| **SUBSTITUTION** | Substitution | "Work you would otherwise have paid someone else to do. Priced at what it would cost to buy, not at what it saved you." |
| **MODELED** (quietest, last, always a range) | Modeled | "Exposure you are no longer carrying. Probabilistic by nature, so it is always a range and never a single number." |

Modeled inline inputs (never a footnote): *"Using your 12% annual departure probability · ±35% band"* — or *"No departure probability entered yet · ±35% band"*.

### Line labels (drill-down)
| Event | Label | Quantity unit shown when unpriced |
|---|---|---|
| pattern_captured | Judgment written down | senior hours to rediscover from scratch |
| answer_applied | Answers that landed | questions answered without interrupting an expert |
| prescription_effective | Problems that stopped | recurrences stopped |
| training_generated | Training built in-house | finished training hours |
| gap_closed | Questions that now have answers | reacquisition hours no longer carried |
| ramp_compressed | People up to speed faster | completed onboarding tracks |

- **No rate:** "no rate entered"
- **Needs a rate:** "Needs: Senior loaded rate. **Enter your rates →**"
- **Excluded:** "{n} excluded — too thin to value confidently."
- **Drill-down toggle:** "Show what's behind this" / "Hide"
- **Empty tier:** "Nothing recorded in this tier yet."

### The no-rates state (every new pilot, day one)
- **Heading:** "Your rates aren't in yet"
- **Lead:** "Everything below is already counted. It just doesn't carry a dollar figure until you say what your time and your incidents actually cost. Two minutes, and it's yours to change any time."
- **CTA:** "Enter your rates →"

### "Your numbers" (editable in place)
- **Lead:** "Every figure above is one of your quantities multiplied by one of these. Change one and the totals move. We never fill these in for you — a default would be us inventing your business."

| Field | Unit | Help text |
|---|---|---|
| Senior loaded rate | $ / hour | Fully loaded hourly cost of one of your senior people. |
| Expert interruption rate | $ / hour | What an hour of an expert's time costs when somebody has to go ask them. |
| Minutes per interruption | minutes | How long one unanswered question actually costs — the ask plus getting back into the work. |
| Instructional design rate | $ / finished training hour | What you'd pay an outside designer to build one finished hour of training. |
| Rework incident cost | $ | What one rework or quality incident costs this operation. |
| Loaded annual salary | $ / year | Fully loaded annual cost of the role you're ramping. |
| Average ramp | weeks | How long it takes someone in that role to get to full speed. |
| Ramp weeks credited per track | weeks | How many of those weeks you credit to finishing a structured onboarding track. Capped at the average ramp above. |
| Annual departure probability | 0–1 | Your own read on how likely a given person is to leave in a year. Drives every modeled figure. |

**Validation errors:**
- "Departure probability is a number between 0 and 1 — 0.12 means a 12% chance in a year."
- "Those need to be plain positive numbers — no currency symbols or commas."

### The ledger's caveats — appended to the readout's existing "What this readout can't see"
⭐ **ONE limits section on the page, not two.** Two teaches the reader that neither matters. These lines join the readout's own notes:

- "No saving is claimed anywhere on this page. Every figure is an acquisition cost — what this cost to get, or what it would cost to get again."
- "Modeled figures are probabilistic and are shown as a ±35% range. They are not revenue, they are not cash, and they should never be added to the realized number."
- "{n} rates are still blank — {list}. Anything that depends on them is counted but not priced."
- "{n} captured frameworks were too thin to value confidently and are excluded from every total above. Excluding them is deliberate — a guess would be worse."
- "The ledger only ever adds. Editing a rate re-prices history, it never rewrites what happened or when."

---

## 3. `/readout` — what changed

- Gate widened: **"The readout is for managers, executives, and account admins."**
- The Value Ledger section (§2) inserted below the anchor card.
- The ledger's caveats merged into the existing "What this readout can't see".
- **The PDF is unaffected by the move** — it still carries the compact three-number block, and still renders nothing when no tier has a figure.

---

## 4. The PDF footnote

- **Heading:** What that cost to acquire
- **Lead:** "Priced entirely with rates your organization entered. An acquisition cost, never a saving."
- **Footnote (one paragraph, 7pt):**
  > "3 captured frameworks were too thin to value confidently and are excluded above. Figures use your organization's own assumptions as of 8/6/2026: Senior loaded rate 118 $ / hour · Expert interruption rate 145 $ / hour · Minutes per interruption 25 minutes · Instructional design rate 1200 $ / finished training hour · Rework incident cost 4800 $ · Annual departure probability 0.12 0–1. Modeled figures carry a ±35% band. No saving is claimed anywhere on this page."

- **Page footer, changed:** was *"No figure on this page is estimated, modeled, or extrapolated."* → now *"Nothing on this page is estimated on your behalf — every rate behind a dollar figure is one your organization entered."*
  - ⚠️ The old sentence became false the moment a modeled range appeared on the page. The new one is the amended doctrine stated in one line. **This is a change to already-approved T1B3 copy and needs your explicit nod.**

---

## 5. Dashboard — the fifth card

The v2.58 four-card collapse becomes **five**. Manager · admin · executive seat; hidden, never shown-and-gated.

> **⚠️ What's at risk**
> Which judgment sits in too few heads, and what your own frameworks are telling you to watch.
> **[Open →]**

The temporary Exposure/Ledger header links are gone. The **Readout** header link now shows for executive seats too.

---

## 6. 🔔 One schema call

The brief's `value_assumptions` list leaves three figures with nowhere honest to come from: **how long an unanswered ask costs an expert**, **how likely a holder is to leave**, and **how many ramp weeks a completed onboarding track is credited with**. Every one is a fact about the customer's operation.

With no column for them, the code would have to invent them — the one thing the amended doctrine forbids. So I added three customer inputs, NULL like every other rate: `expert_interruption_minutes`, `annual_departure_probability`, `ramp_weeks_credited_per_track`.

**The alternative is shipping three of the six event types permanently dark.** Your call whether they stay.
