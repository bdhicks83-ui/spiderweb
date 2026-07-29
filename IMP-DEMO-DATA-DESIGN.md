# IMP DEMO DATA DESIGN — AWIP-Authentic Rebuild
Draft for Brian's review · July 28, 2026 · APPROVED, building now.

Replaces the generic "Meridian Precision Manufacturing" demo data with authentic insulated metal panel (IMP) manufacturing + project-management content modeled on AWIP. Real names mapped to demo roles.

## THE COMPANY (demo org)
All Weather Insulated Panels (AWIP) — DEMO. Foam composite insulated metal panels, continuous-line manufacturing. Real footprint: Vacaville CA, Little Rock AR, East Stroudsburg PA. Product line: wall panels (flat, embossed, Mesa, architectural/FASSADE), roof/deck systems (OneDek), cold storage, hardwall (HW40). Demo centers on the Little Rock plant with cross-plant references.

## THE PEOPLE (real names → demo roles)
| Name | Role | Expert on… |
|---|---|---|
| Brian Ng | Panel Technical Expert / R&D | Foam chemistry, bond strength, laminator settings, new-product qualification |
| Brian Hicks | Sr. Director, HR & EHS | Safety judgment, incident response, cross-functional people calls |
| Zach Davis | Sr. Manager, EHS | Line safety, LOTO, chemical handling, near-miss judgment |
| Klaudia Donaghy | Sr. Manager, Talent Development & Recruiting | Onboarding operators, skills gaps, training that sticks |
| Joe Paparella | President, AWIP | Strategic calls, margin vs. capacity |
| Brian Montes | VP, Operations | Line throughput, changeover calls, capacity allocation |
| Chuck Milner | Little Rock Plant Manager | Running the Little Rock line day to day |
| John Dial | Divisional Inventory Controller | Coil/chemical inventory, raw-material timing |
| Kim Harrell | VP, Sales | What to promise, custom vs. standard, margin on the deal |
| Ben Seger | Territory Manager | Field/customer reality, scoping jobs |
| Carlos Ramos | Divisional Maintenance Manager | Line reliability, laminator/saw maintenance |
| Richard Jenkins | Multi-Function Operator | Floor-level "reads the line before the gauge catches it" (made-up if needed) |
| Dana Whitfield | Quality Manager, Little Rock | QC gates, delamination/foam-void calls, hold-or-release (made-up) |
| Marcus Webb | Project Manager | Shop drawings, order-to-delivery, win-column subject |
| Tyler Brooks | Operator (role=member) | Coaching-watch subject (made-up) |

## THE DEMO SPINE — post-changeover release conflict
The conflict: after a line changeover, do you release the first production run before full bond-strength/delamination inspection clears?

- **Framework 1** "The No-Release Gate" — Dana Whitfield (Quality): never release until first-article bond-strength and cut-section clear. Full-stop gate.
- **Framework 2** "The Controlled Restart Release" — Brian Ng (R&D): profile-only changeovers can release on a peel-check while the full cut-section runs in parallel. Conditional release.

Both legitimate expert judgment, contradicting on the same trigger. Status: OPEN. Centerpiece conflict — retrieval query surfaces it, Conflict X-ray flags it.

📌 **Shoot retrieval query:** "We had a delamination escape right after a profile changeover on the Little Rock line — should we release the next run before the bond-strength inspection clears?" → should return "The Controlled Restart Release" (Brian Ng) as top match, CONTESTED badge (Dana Whitfield's gate on the other side).

## THE FRAMEWORKS (10, see IMP-DEMO-FRAMEWORK-CONTENT.md for verbatim text)
1. The No-Release Gate — Dana Whitfield (conflict side A)
2. The Controlled Restart Release — Brian Ng (conflict side B)
3. Reading the Laminator Before the Panel Tells You — Richard Jenkins
4. The Coil-Lot / Chemical-Lot Changeover Rule — Brian Ng
5. Hold the Line for Maintenance, or Run to Order — Carlos Ramos
6. The Shop-Drawing Release Judgment — Marcus Webb
7. Custom Profile: Promise It or Walk — Kim Harrell (secondary conflict side A)
8. Capacity Reality First — Brian Montes (secondary conflict side B)
9. The Tolerance Pre-Check Before Fab — Ben Seger
10. The Near-Miss That Isn't Minor — Zach Davis

## THE CROSS-FUNCTIONAL CONFLICT
Framework 7 (Kim Harrell, Sales — "find a way to yes") vs. Framework 8 (Brian Montes, Ops — "don't promise what the line can't hold"). Contradicts on: how to handle a custom/tight-date order at quote time. Status: OPEN.

## THE PRESCRIPTION
Recurring gap: newer Little Rock operators releasing post-changeover runs without the peel-check → recurring delamination escapes. Built from Framework 2 + Framework 3.
- Rung 2: written job-aid on the peel-check gate → doesn't fully land, escapes continue.
- Rung 3 (escalation): hands-on drill under Richard Jenkins — format switches from job-aid to drill.
- Contrast: one "proven effective" prescription — a coil-lot re-qualify checklist that stopped a recurring density-drift escape.

## THE WIN COLUMN
Marcus Webb (PM) named in 3 leader write-ups (Kim Harrell/Sales, Brian Montes/Ops, Chuck Milner/Plant) for catching an out-of-tolerance substrate on a cold-storage job before panels shipped, avoiding a six-figure field-rework.

## THE KNOWLEDGE GAP (P-9)
Open: "What's our policy on approving a customer's request for a panel thickness that falls between our two standard laminator settings?" Brian Ng fills it live in the demo.

## COACHING WATCH (P-6)
Tyler Brooks (operator, role=member) — two records: near-miss on a saw changeover + scrapped bundle from a missed peel-check. Surfaces privately to Chuck Milner (Plant Manager, manager). Blameless, manager-only.
