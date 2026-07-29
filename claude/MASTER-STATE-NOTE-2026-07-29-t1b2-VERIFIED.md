# T1B2 VERIFICATION — 2026-07-29 · Capture Campaign

> **STATUS: ✅ DEPLOYED + BROWSER-VERIFIED on `spiderweb-nine.vercel.app`**, with
> ONE REAL BUG FOUND AND FIXED MID-WALK (details below). Migration run, policy
> corrected, redeployed, re-verified. Folds into `MASTER-STATE.md` at **v2.45**
> alongside `claude/MASTER-STATE-NOTE-2026-07-29-t1b2-capture-campaign.md`.
>
> Identity switching was done entirely with **T1B1's own admin-issued sign-in
> links** — no password was ever typed. Build 1 paid for itself inside Build 2's
> verification.

---

## The walk, as three identities

**Chuck Milner (manager + org admin)** — created *"Little Rock: the calls nobody
has written down"* seeded from the real AWIP gap (*panel thickness between the
two standard laminator settings*, asked 3×) and assigned it to Dana Whitfield
and Brian Ng.

| Check | Result |
|---|---|
| Create panel, gaps tab default | ✅ real gaps listed, most-asked first |
| Ask carries the gap provenance | ✅ `source='gap'`, "from the gaps queue" chip |
| Campaign + asks written | ✅ 2 asks, progress 0/2 |

**Brian Montes (manager, NOT an admin)** — the boundary identity.

| Check | Result |
|---|---|
| Sees the campaign | ✅ (org-wide, by design) |
| Sees Brian Ng's ask (his direct report) | ✅ |
| Sees Dana's ask (not his report, not his ask) | ✅ **correctly hidden** |
| `/api/admin/overview` | ✅ 403 |
| Progress totals | 🔴 **read "0 of 1" for a 2-ask campaign** → see below |

**Brian Montes as an assignee** — the full loop, end to end.

| Check | Result |
|---|---|
| Nav badge | ✅ amber "● 1 asked of you" |
| `/requests` | ✅ his ask only — no roster, no comparison to anyone |
| Card content | ✅ campaign, "asked by Chuck Milner", the question verbatim, the purpose |
| "Capture this" → `/codify?request=…` | ✅ claimed (`started`), **banner carries the exact question, the asker, and the purpose into the interview** |
| Return to `/requests` | ✅ chip flipped to "in progress", button became "Pick this back up" |
| "Link something I already captured" | ✅ dropdown offered **only his own** frameworks (author-gating visible in the UI) |
| Linked *Capacity Reality First* | ✅ status → captured, framework name shown, badge dropped to 0 |
| Campaign progress after | ✅ 1 of 3, 33%, "1 of 3 people have captured something" |

---

## 🔴 The bug the walk found — and the fix

**Symptom:** Montes was shown **"0 of 1 captured"** on a campaign that had two
asks.

**Cause:** progress was computed from the rows the *caller* could read. Not a
leak — worse in a quiet way. A partial view rendered as the whole, with nothing
saying so, is how a manager reports a wrong number upward with total confidence.
It also violated this build's own `progress_is_partial` field, which shipped
hardcoded to `false` and was never wired.

**Second defect behind the same cause:** a manager who is not an admin could
send ten asks and only see the ones that happened to go to their own direct
reports. The feature silently half-worked for exactly the person it was built
for.

**Fix, both halves shipped and re-verified:**

1. **Totals now come from the true row set** (service role), because **an
   aggregate carries no name** — "6 of 15 captured" says nothing about who. The
   per-person roster stays RLS-scoped. Same shape as P-9's org-wide gap row: a
   COUNT, never a NAME. Plus `roster_is_partial` / `roster_shown` /
   `roster_total` and an on-page line when the list is shorter than the
   campaign — no silent caps.
2. **RLS gained `created_by = auth.uid()`** — you can read the asks you
   personally sent. Still not org-wide.

**Both re-verified live after redeploy:**

| Check | Result |
|---|---|
| Montes sees true totals | ✅ 4 asks (was lying "1") |
| Roster still scoped | ✅ 3 of 4 rows, `roster_is_partial: true` |
| Ask Montes sent to Dana (not his report) | ✅ **visible — `created_by` clause proven** |
| Ask *Chuck* sent to Dana | ✅ **still hidden from Montes** |

That last pair is the decisive one: same person, same campaign, two asks — the
one Montes sent is visible, the one he didn't is not.

---

## Honest gaps

1. **The auto-reconcile branch is UNCLICKED.** The `link`-a-framework path is
   verified live; `reconcileStartedRequests()` matching a *freshly completed*
   pattern_record to a started ask is not, because exercising it needs a real
   multi-turn `/codify` session authoring AWIP technical judgment — customer-
   facing demo content, which is Brian's call, not mine. Same posture as P-8's
   six unclicked writers: covered by the code path the `link` route shares, but
   an unclicked writer is an unverified writer. **Cheapest close: the next real
   capture session Brian runs, started from an ask.**
2. **`POST /api/campaigns/[id]` (add asks to an existing campaign) has no UI
   entry point.** The route works — the verification used it — but nothing on
   `/campaigns/[id]` calls it. Either wire an "Ask someone else too" control or
   drop the route. Flagged rather than quietly left.
3. **`window.confirm` on "Close this campaign"** has the same automation-blocking
   property flagged in T1B1. Fine for a human; not machine-verifiable.

---

## Loose ends for Brian (all one-click, no SQL)

| Item | How |
|---|---|
| `T1B1 Verify Seat` still active in the AWIP roster | Sign in as Chuck → `/admin` → Close this seat |
| Demo campaign carries 2 verification asks ("Boundary check…", the duplicate thickness ask to Dana) | `/campaigns/bb5541e6…` → close the campaign, or curate before filming |
| Browser is signed in as **Brian Montes** | — |

⭐ **Worth keeping:** the campaign itself is genuinely good demo material — it is
seeded from a real unanswered question, it shows the demand count, and one ask
is already captured with a framework attached. If the shoot wants a campaign on
screen, curate this one rather than seeding a new one.
