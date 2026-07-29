# 🏭 IMP DEMO DATA DESIGN — AWIP-Authentic Rebuild

Draft for Brian's review · July 28, 2026 · Approved (delivered with the reseed handoff)

Replaces the generic "Meridian Precision Manufacturing" demo data with authentic insulated metal panel (IMP) manufacturing + project-management content modeled on AWIP. Real names mapped to demo roles. Research-grounded so the frameworks sound like they came from people who actually run a panel line.

## THE COMPANY (demo org)

All Weather Insulated Panels (AWIP) — DEMO. Foam composite insulated metal panels, continuous-line manufacturing. Real footprint: Vacaville CA, Little Rock AR, East Stroudsburg PA. Product line: wall panels (flat, embossed, Mesa, architectural/FASSADE), roof/deck systems (OneDek), cold storage, hardwall (HW40). The demo can center on the Little Rock plant (matches Chuck Milner's role) with cross-plant references.

## THE PEOPLE (real names → demo roles)

| Name | Role | In the demo, they're the expert on… |
|---|---|---|
| Brian Ng | Panel Technical Expert / R&D | Foam chemistry, bond strength, laminator settings, new-product qualification |
| Brian Hicks | Sr. Director, HR & EHS | Safety judgment, incident response, cross-functional people calls, EHS/ops balance |
| Zach Davis | Sr. Manager, EHS | Line safety, LOTO, chemical handling, near-miss judgment |
| Klaudia Donaghy | Sr. Manager, Talent Development & Recruiting | Onboarding operators, skills gaps, training that sticks |
| Joe Paparella | President, AWIP | Strategic calls, margin vs. capacity, which business to chase |
| Brian Montes | VP, Operations | Line throughput, changeover calls, capacity allocation across plants |
| Chuck Milner | Little Rock Plant Manager | Running the Little Rock line day to day, the floor-level calls |
| John Dial | Divisional Inventory Controller | Coil/chemical inventory, raw-material timing, the material-availability calls |
| Kim Harrell | VP, Sales | What to promise, custom vs. standard, margin on the deal |
| Ben Seger | Territory Manager | Field/customer reality, scoping jobs, the sales-to-ops handoff |
| Carlos Ramos | Divisional Maintenance Manager | Line reliability, laminator/saw maintenance, downtime calls |
| Richard Jenkins | Multi-Function Operator | The floor-level "reads the line before the gauge catches it" expert |
| Dana Whitfield (made-up) | Quality Manager, Little Rock | QC gates, delamination/foam-void calls, hold-or-release |
| Marcus Webb | Project Manager | Shop drawings, order-to-delivery, the schedule the whole building hangs on |
| Tyler Brooks (made-up) | Operator | Coaching-watch subject; role=member |

(Marcus Webb kept from the original as the Win Column recognition subject — now a PM. Dana Whitfield added as Quality, since the demo spine is a quality call.)

## THE DEMO SPINE — the die-changeover conflict, reborn as an IMP quality call

The conflict: after a line changeover, do you release the first production run before full bond-strength / delamination inspection clears? On a continuous IMP line, after a profile or thickness changeover (or a foam-chemical lot change), the first panels off the line are the highest-risk for facer delamination (foam not bonding to the metal skin) and foam voids / density issues — the cure and cell formation haven't stabilized. There's a real, live tension between throughput (the line is expensive to hold) and quality (a delaminated panel that ships can fail in the field — a wall panel losing its skin is a warranty and safety event).

- **Framework A — "The No-Release Gate" — Dana Whitfield (Quality):** never release a post-changeover run until first-article bond-strength and a cut-section foam inspection clear. A delaminated panel in the field is unrecoverable; the line hold is cheap by comparison. Full-stop gate.
- **Framework B — "The Controlled Restart Release" — Brian Ng (R&D/Technical):** if the changeover was profile-only (same foam chemistry, same lot), the bond risk is low and you can release on a visual + peel-check of the first bundle while the full cut-section runs in parallel. Conditional release.

Both are legitimate expert judgment. They contradict on the same trigger (post-changeover first run). Status: OPEN. This is the demo's centerpiece conflict — the retrieval query surfaces it, the conflict X-ray flags it.

📌 **Shoot retrieval query (IMP version):** "We had a delamination escape right after a profile changeover on the Little Rock line — should we release the next run before the bond-strength inspection clears?" → should return "The Controlled Restart Release" (Brian Ng) as top match, with the CONTESTED badge (Dana Whitfield's gate on the other side).

## THE FRAMEWORKS (~10 to seed a believable library)

1. "The No-Release Gate" — Dana Whitfield — post-changeover quality hold (conflict side A).
2. "The Controlled Restart Release" — Brian Ng — conditional post-changeover release (conflict side B).
3. "Reading the Laminator Before the Panel Tells You" — Richard Jenkins (operator).
4. "The Coil-Lot / Chemical-Lot Changeover Rule" — Brian Ng.
5. "Hold the Line for Maintenance, or Run to Order" — Carlos Ramos.
6. "The Shop-Drawing Release Judgment" — Marcus Webb (PM).
7. "Custom Profile: Promise It or Walk" — Kim Harrell (Sales).
8. "Capacity Reality First" — Brian Montes (VP Ops).
9. "The Tolerance Pre-Check Before Fab" — Ben Seger (Territory).
10. "The Near-Miss That Isn't Minor" — Zach Davis (EHS).

(Note: the final content doc assigned F8 to Brian Montes as the second conflict side; "Coil Inventory vs. Order Timing" — John Dial — was in the long-list but is not among the 10 finals.)

## THE CROSS-FUNCTIONAL CONFLICT (second contested pair)

Kim Harrell (Sales) "Custom Profile: Promise It or Walk" ⚔ Brian Montes (VP Ops) "Capacity Reality First" — contradicts on how to handle a custom/tight-date order at quote time. Status: OPEN. This is the misalignment the buyer feels every week.

## THE PRESCRIPTION (the training payoff)

The recurring gap: newer operators on the Little Rock line keep releasing post-changeover runs without the peel-check, causing delamination escapes. The system detects the recurrence, prescribes training built from Brian Ng's "Controlled Restart Release" + Richard Jenkins' "Reading the Laminator" frameworks, paired to the operators, at the floor altitude.

- First prescription (rung 2): a written job-aid on the peel-check gate. It doesn't fully land — escapes continue.
- Escalation (rung 3): the system re-recommends a hands-on drill — operators run a deliberate peel-check on first-bundle samples under Richard Jenkins' eye. Format switches because reading a job-aid ≠ developing the hands-on feel. (The format-adaptation beat.)
- One "proven effective" prescription elsewhere for contrast (coil-lot re-qualify checklist that stopped a recurring density-drift escape).

## THE WIN COLUMN (recognition)

Marcus Webb (PM) named by leaders across 3 write-ups for saving a major cold-storage job — caught an out-of-tolerance substrate before panels shipped (using the tolerance pre-check), avoiding a six-figure field-rework. Named by Sales (Kim Harrell), Ops (Brian Montes), and the Plant (Chuck Milner). The quiet PM everyone relies on.

## THE KNOWLEDGE GAP (P-9 demand-side)

"What's our policy on approving a customer's request for a panel thickness that falls between our two standard laminator settings?" — nobody's codified it, flagged gap, left OPEN. In the live demo, Brian Ng fills it (an R&D/technical call), and it becomes retrievable.

## COACHING WATCH (P-6)

Tyler Brooks (made-up newer operator) has two friction/concern records — a near-miss on a saw changeover and a scrapped bundle from a missed peel-check. Surfaces privately to Chuck Milner (Plant Manager) as an early coaching signal, before it's a documented failure. Blameless, manager-only.
