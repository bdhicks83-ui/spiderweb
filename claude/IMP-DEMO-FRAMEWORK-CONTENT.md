# 🏭 IMP DEMO — FULL FRAMEWORK CONTENT (ready to seed)

July 28, 2026 · The actual codified judgment for the AWIP/IMP demo reseed. This is the CONTENT (the frameworks in each expert's voice). The reseed script inserts these verbatim. Written to sound like real panel-line judgment. Track B voice, gender-neutral, first-person expert.

## ORG

All Weather Insulated Panels (AWIP) — DEMO · Little Rock, AR plant as the primary site.

## EXPERTS (name · role)

* Brian Ng · Panel Technical Expert / R&D
* Brian Hicks · Sr. Director, HR & EHS
* Zach Davis · Sr. Manager, EHS
* Klaudia Donaghy · Sr. Manager, Talent Development & Recruiting
* Joe Paparella · President
* Brian Montes · VP, Operations
* Chuck Milner · Little Rock Plant Manager
* John Dial · Divisional Inventory Controller
* Kim Harrell · VP, Sales
* Ben Seger · Territory Manager
* Carlos Ramos · Divisional Maintenance Manager
* Richard Jenkins · Multi-Function Operator
* Dana Whitfield · Quality Manager, Little Rock
* Marcus Webb · Project Manager
* Tyler Brooks · Operator (coaching-watch subject; role=member)

## FRAMEWORK 1 — "The No-Release Gate"

Dana Whitfield · Quality · type: judgment call · CONFLICT SIDE A · status feeds the OPEN conflict

**The situation it's for:** The first production run after a profile changeover, a thickness change, or a foam/coil lot change — when someone wants to release those panels to bundle-and-ship before full inspection clears.

**The call:** Don't release. Hold the run until first-article bond-strength testing and a cut-section foam inspection both clear. No exceptions on the first run after a changeover.

**The signals:** Any changeover in the last run — profile, thickness, foam chemical lot, or coil lot. First bundles off the line after a line stop. Any laminator parameter that drifted during the changeover and hasn't re-stabilized.

**The reasoning:** A delaminated panel that ships is unrecoverable. Once it's on a building and the facer separates from the foam, that's a warranty claim, a possible safety event, and our name on a failed wall. The line hold costs us minutes of capacity. The field failure costs us the customer and the reputation. That trade is not close. The first run after any changeover is exactly when bond strength is least predictable — the cure and cell formation haven't settled — so that's precisely when the gate has to hold.

**Where it stops applying:** This is about the first run after a change. A stable run that's been producing good cut-sections for hours doesn't need the full gate on every bundle — that's what in-line monitoring is for. The gate is for the transition, not steady state.

## FRAMEWORK 2 — "The Controlled Restart Release"

Brian Ng · R&D/Technical · type: judgment call · CONFLICT SIDE B · contradicts Framework 1

**The situation it's for:** Same trigger — first run after a changeover — but specifically when the changeover was profile-only: same foam chemistry, same coil lot, same thickness, just a different face profile.

**The call:** You can release the first bundle on a visual plus a hand peel-check, while the full cut-section bond test runs in parallel — as long as nothing about the foam system changed. Don't hold the whole line for a low-risk changeover.

**The signals:** Profile-only changeover (foam chemistry, chemical lot, coil lot, and thickness all unchanged). Laminator temps and line speed back to the qualified setpoint. First-bundle peel-check shows clean cohesive foam failure, not adhesive (facer) failure.

**The reasoning:** Bond strength is driven by the foam-to-facer chemistry and the cure, not by the face profile. If none of the foam variables changed, the delamination risk on a profile-only changeover is genuinely low, and the peel-check catches the large majority of adhesion problems in thirty seconds. Holding an expensive continuous line for a full cut-section cycle on a low-risk changeover burns capacity we can't get back — and capacity is the constraint that determines whether we hit the ship dates sales already promised. The judgment is matching the inspection depth to the actual risk of the change, not applying the maximum gate to every transition.

**Where it stops applying:** The moment ANY foam variable changes — new chemical lot, new coil lot, thickness change, or a laminator parameter that won't hold setpoint — this does NOT apply and you're back to the full gate. A peel-check does not substitute for a cut-section when the chemistry is in question.

> ⚠️ This is the demo's spine conflict. F1 and F2 give opposing guidance on the same trigger (first run after a changeover). The difference is the scope of the changeover — but on the floor, in the moment, they read as "hold" vs "release," and that's the disagreement the Conflict X-ray surfaces. Both are right within their bounds; the org has to decide the default. Status: OPEN.

## FRAMEWORK 3 — "Reading the Laminator Before the Panel Tells You"

Richard Jenkins · Operator · type: recurring friction / judgment

**The situation it's for:** Running the line when a bond or foam problem is starting but the cut-section saw hasn't caught it yet.

**The call:** Trust the laminator's behavior over the last-good cut-section. If the sound, the pull, or the temperature profile changes, treat the panels as suspect now — don't wait for the next scheduled cut to confirm it.

**The signals:** A change in the laminator sound — foam that's off-ratio or off-temp cures with a different note. Rising back-pressure or a change in how the ribbon pulls through. Panel face temperature coming off the laminator reading higher or lower than the run has been holding. Any of these before the next cut-section is due.

**The reasoning:** The cut-section saw tells you the truth, but it tells you late — you've already made a bundle of suspect panels by the time a bad cut shows up. The laminator tells you early if you know its normal behavior. Twenty years on this line and the sound changes before the gauge does. A newer operator waits for the cut and scraps a bundle; a veteran hears it, flags it, and pulls one panel to check before the whole bundle is committed.

**Where it stops applying:** This is a leading-indicator instinct, not a measurement — it tells you when to check, not what's wrong. Always confirm with an actual cut-section before you scrap or release. Don't scrap on the sound alone; scrap on the cut the sound told you to take.

## FRAMEWORK 4 — "The Coil-Lot / Chemical-Lot Changeover Rule"

Brian Ng · R&D/Technical · type: judgment call

**The situation it's for:** A new coil lot or a new foam chemical lot is going into the line — deciding what to re-qualify and what carries over.

**The call:** Re-qualify bond strength and foam density on any new chemical lot, always. On a new coil lot of the same spec, a first-article dimensional and adhesion check is enough — but never assume adhesion carries across a coating or supplier change.

**The signals:** New chemical lot number = full re-qualify. New coil lot, same mill and coating = first-article check. New coil supplier OR new coating system = treat as a chemical-lot-level re-qualify, because the adhesion surface changed.

**The reasoning:** Foam density and adhesion drift with chemical-lot variation — that's inherent to the chemistry, and it's the variable most likely to cause a delamination escape you didn't see coming. Coil dimensional properties are more stable lot-to-lot, so a lighter check suffices — unless the coating changed, because the foam bonds to the coating, not the steel. The whole rule is about spending your inspection effort where the actual variation lives.

**Where it stops applying:** Doesn't apply to within-lot running. And if you're chasing an intermittent adhesion problem, ignore this and re-qualify everything — when you're already in a failure investigation, lot boundaries stop being a safe assumption.

## FRAMEWORK 5 — "Hold the Line for Maintenance, or Run to Order"

Carlos Ramos · Maintenance · type: judgment call

**The situation it's for:** The laminator or a saw is showing early wear signs mid-run, and there's a hot order on the line — deciding whether to push through or pull the line for maintenance now.

**The call:** Pull the line now if the wear signal touches product quality or safety (laminator bearing, foam metering, saw blade runout). Push through only if the wear is cosmetic or on a redundant system, and you can finish the order inside the window before it becomes a real failure.

**The signals:** Quality-touching wear (metering pump drift, laminator drive, blade runout on the cut) = pull now. Non-quality wear (a guard, a non-critical conveyor) = can finish the order. The size of the run left vs. how fast the signal is trending.

**The reasoning:** A metering or laminator failure mid-run doesn't just stop the line — it can ruin the panels already in the laminator and mask itself as a foam problem, so you chase the wrong cause. Downtime now is scheduled and cheap; a failure mid-run is unscheduled, scraps product, and costs more total downtime. But not every wear signal is worth stopping a hot order for — a cosmetic issue on a redundant system can wait for the changeover. The judgment is whether the wear can reach the product before the order's done.

**Where it stops applying:** If a customer's ship date is genuinely at risk and the wear is confirmed non-quality, running to finish is defensible — but that's Brian Montes's capacity call to make with eyes open, not a maintenance call to make quietly.

## FRAMEWORK 6 — "The Shop-Drawing Release Judgment"

Marcus Webb · Project Manager · type: judgment call

**The situation it's for:** Deciding whether to release shop drawings to fabrication with ~90% of the architect's information, or wait for final tolerances and details.

**The call:** Release early on standard conditions and long-lead panel quantities; hold only the specific details that are genuinely unresolved (unusual penetrations, complex roof geometry, interface details). Don't hold the whole package for a few open details.

**The signals:** IMP is on the critical path — 10 to 16 weeks lead. The standard field conditions are settled even if a few details aren't. The open items are isolated and detailable later without changing panel quantities or profiles.

**The reasoning:** IMP lead time drives the whole building schedule — if we wait for a perfect drawing set, we've put the critical-path item weeks behind for the sake of details that don't touch the bulk of the order. Releasing the settled 90% buys schedule we can't recover later. The risk is rework if an open detail changes a released panel — so the skill is knowing which details can move without affecting fabricated panels, and holding exactly those. Release the schedule-drivers, hold the genuine unknowns.

**Where it stops applying:** Doesn't apply when the open items are the panel profiles, thicknesses, or quantities themselves — if the fundamentals aren't settled, releasing early just fabricates the wrong panels. Early release is for detail-level unknowns, not scope-level ones.

## FRAMEWORK 7 — "Custom Profile: Promise It or Walk"

Kim Harrell · Sales · type: judgment call

**The situation it's for:** A customer wants a custom profile, color, or tolerance, and Sales has to decide at quote time whether to promise it.

**The call:** If the deal is winnable, give the customer the yes at quote time and keep it moving — get the number out, win the PO, then sit down with Brian Montes and Brian Ng on how the plant hits it. Speed wins customs: the quote that waits on an internal capacity review loses to whoever answered first. Promise it or walk — the one thing we don't do is the slow maybe.

**The signals:** Off-standard profile requiring tooling. A color outside our standard coil coatings. A dimensional tolerance tighter than the line's proven capability. A thickness between our standard laminator setpoints.

**The reasoning:** Custom buyers are comparing response speed as much as price — by the time a quote has been through an internal review loop, the competitor who said yes first has the PO. The plant has found a way every time the deal was real; the deals we lost waiting for sign-off never came back. An aggressive promise sometimes costs us expedite or overtime on the back end, but that's a cost we can manage down — a lost customer isn't. Sales' job is to win the order; the plant's job is to figure out how. If we only quote what's already proven, we never stretch the line's capability and we train customers to take their customs elsewhere.

**Where it stops applying:** If R&D has flat-out said the line can't hold it — physics, not preference — that's a walk, not a promise. Standard profiles, colors, and tolerances need none of this: quote them instantly. This is for the winnable non-standard ask, where hesitation is the deal-killer.

> ⚠️ This is the SECONDARY conflict — it contradicts Framework 8 (Brian Montes) on how to handle a custom/tight-date order at quote time. Sales leans "find a way to yes"; Ops leans "don't promise what the line can't hold." Status: OPEN. Powers the cross-functional beat.

## FRAMEWORK 8 — "Capacity Reality First"

Brian Montes · VP Operations · type: judgment call · contradicts Framework 7's lean

**The situation it's for:** A custom or tight-date order at quote time — the same decision, from the plant's side.

**The call:** Don't let a date or a custom get promised that the line can't hit at margin. A confirmed-capacity quote beats a won deal we can't produce. Bring Ops into the quote on anything non-standard or date-tight before the number goes to the customer.

**The signals:** The requested date lands in an already-committed capacity window. The custom needs a setup that displaces other scheduled orders. The margin assumes a run rate the line hasn't proven on that profile.

**The reasoning:** Every order sold at a date the plant can't hit costs more than the deal is worth — expedite, overtime, bumped orders, and the reputation hit of a late ship to another customer whose slot got taken. The plant is a finite continuous line; you can't sell the same capacity twice. Sales sees the deal in front of them; Ops sees the whole schedule. The right quote is the one that accounts for what's already committed, not just what's being sold today.

**Where it stops applying:** When there's genuine open capacity and the custom is within the line's proven range, Ops shouldn't be the department of no — approve it fast and let Sales close. This is about protecting committed capacity, not gatekeeping every order.

## FRAMEWORK 9 — "The Tolerance Pre-Check Before Fab"

Ben Seger · Territory Manager · type: recurring friction

**The situation it's for:** Before panels ship to a job site — deciding whether the erected structure's tolerances have been verified.

**The call:** Send a tech rep to verify the erected structure's flatness and squareness against our tolerances before the panels ship, on any job with complex geometry or a first-time erector. IMPs can't be field-modified — an out-of-tolerance substrate is a job-site crisis, not a field fix.

**The signals:** Complex roof geometry or low slope. A first-time or unproven erector. A structure erected by a different trade than usual. Any job where the substrate flatness/squareness wasn't confirmed at the pre-construction meeting.

**The reasoning:** Panels are manufactured to spec and cannot be cut or adjusted in the field. If the structure they're going onto is out of tolerance, the panels won't fit, and you find out with a truck full of panels at the site and a crew standing around. A pre-ship tolerance check catches it while it's a drawing correction, not a six-figure field-rework and a blown schedule. The cost of the check is one tech rep's day; the cost of the miss is the job.

**Where it stops applying:** Standard box buildings with a proven erector who's hit our tolerances before don't need the pre-check every time — that's over-caution. This is for the geometry and the erectors where the risk is real.

## FRAMEWORK 10 — "The Near-Miss That Isn't Minor"

Zach Davis · EHS · type: concern / judgment call

**The situation it's for:** Reading which line near-misses are leading indicators of a serious event versus genuinely minor.

**The call:** Treat any near-miss involving foam chemical exposure, a LOTO shortcut, or a pinch point on the saw/stacker as a leading indicator — investigate it like it was the real event. Genuinely minor near-misses get logged, not investigated. Know the difference by the potential, not the outcome.

**The signals:** Chemical handling (isocyanate exposure potential), any LOTO deviation, saw/gang-saw and robot-stacker pinch points, working-at-height near the line. High-energy sources where the gap between near-miss and serious injury is luck, not design.

**The reasoning:** The outcome of a near-miss is random; the potential is what tells you if it'll be a fatality next time. A LOTO shortcut that didn't hurt anyone this time is the same shortcut that takes a hand next time — the only difference was luck. So we investigate by energy and potential, not by whether someone got hurt. Chasing every minor near-miss burns credibility; missing a high-potential one costs someone. The judgment is reading which is which.

**Where it stops applying:** Low-energy near-misses (a slip on a clean floor, a dropped tool from bench height) get logged and trended, not full-investigated — over-investigating the minor stuff trains people to stop reporting. Reserve the deep investigation for the high-potential events.

## THE PRESCRIPTION (recurring gap → training → escalation)

Detected gap: newer operators on the Little Rock line releasing post-changeover runs without the peel-check → recurring delamination escapes.

* Built from: Framework 2 (Brian Ng, Controlled Restart Release) + Framework 3 (Richard Jenkins, Reading the Laminator).
* Rung 2: written job-aid on the peel-check gate → doesn't fully land, escapes continue.
* Rung 3 (escalation): hands-on drill — operators run deliberate peel-checks on first-bundle samples under Richard Jenkins. Format switches (job-aid → drill) because the feel can't be read from a page.
* One "proven effective" prescription elsewhere for contrast (e.g. a coil-lot re-qualify checklist that stopped a recurring density-drift escape).

## THE WIN COLUMN

Marcus Webb named in 3 leader write-ups for catching an out-of-tolerance substrate on a major cold-storage job before panels shipped (using the tolerance pre-check), avoiding a six-figure field-rework. Named by Kim Harrell (Sales), Brian Montes (Ops), Chuck Milner (Plant). The quiet PM everyone relies on.

## THE KNOWLEDGE GAP (P-9)

Seeded open gap: "What's our policy on approving a customer's request for a panel thickness that falls between our two standard laminator settings?" — nobody's codified it. In the live demo, Brian Ng fills it (an R&D call). Shows the demand side closing on authentic IMP content.

## COACHING WATCH (P-6)

Tyler Brooks (operator, role=member) — two records: a near-miss on a saw changeover + a scrapped bundle from a missed peel-check. Surfaces privately to Chuck Milner as an early coaching signal. Blameless, manager-only.
