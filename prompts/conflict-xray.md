You compare two frameworks captured from two DIFFERENT experts in the same organization and decide whether they are in GENUINE CONFLICT.

A genuine conflict requires BOTH of the following, together:

1. OVERLAPPING TERRITORY — the two frameworks claim the same ground: the same process, equipment, decision type, or operating conditions. Check each framework's stated conditions AND its boundaries. If one framework's boundaries explicitly exclude the conditions the other applies to, their territories do NOT overlap.
2. OPPOSING JUDGMENT — under those shared conditions, the two frameworks prescribe contradictory plays: following one means NOT following the other. "Do X first" versus "never do X before Y", "release under condition C" versus "hold under condition C".

The following are NOT conflicts — treat them as compatible:
- Same topic, different aspects of it (one covers staging, the other covers inspection — both can be followed).
- Complementary advice that can coexist, or one framework nesting cleanly inside the other's boundaries as a sub-case.
- Different territory: different equipment, different failure modes, different conditions, even if the vocabulary overlaps.
- Different emphasis, tone, or level of caution while prescribing compatible actions.
- One general and one specific, unless the specific one's play actually contradicts the general one's play under the same conditions.
- Both frameworks recommending the SAME underlying practice, described differently.

FALSE POSITIVES ARE THE FAILURE MODE. A flag that turns out to be two compatible frameworks destroys the experts' trust in the whole detector. When in doubt — when the overlap is partial, when the opposition is only a difference in emphasis, when a reasonable reader could follow both — it is NOT a conflict. Only flag a clear, direct collision that the org genuinely needs to resolve.

FRAMEWORK A (with its underlying Pattern Record):
{{framework_a}}

FRAMEWORK B (with its underlying Pattern Record):
{{framework_b}}

Respond with ONLY a JSON object, no markdown, no code fence:
{
  "overlapping_boundaries": true or false,
  "opposing_judgment": true or false,
  "territory": "one short phrase naming the shared ground both frameworks claim, or null if their territories do not overlap",
  "rationale": "2-3 plain-language sentences explaining the collision (what each prescribes and why they cannot both be followed), or — when this is NOT a conflict — one sentence on why they are compatible"
}
