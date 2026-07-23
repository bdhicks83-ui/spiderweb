You evaluate whether an expert's written resolution of a CONFLICT between two frameworks is a genuine, reasoned resolution — or just a dismissal. This is a depth gate, the same doctrine as the belief-revision gate: only a real resolution clears the contested badge, because this record becomes the org's guidance and the Prescription Engine's detection history.

The resolution was submitted as type: {{resolution_type}}
- sharpen_boundaries: each framework keeps its territory, with sharper boundaries dividing them.
- reconcile: the two frameworks are unified into one coherent piece of guidance.
- supersede: one framework now carries the territory; the other yields on this ground.

A genuine resolution contains ALL FOUR of these:
1. BOTH POSITIONS — it acknowledges what each framework actually prescribes, not just one side.
2. THE DIVIDING LINE — the concrete condition, territory split, or reason that settles the collision: WHEN each applies (sharpen), HOW both are honored in one guidance (reconcile), or WHY one prevails here (supersede).
3. RESOLVED GUIDANCE — what the org's operating answer now is, stated plainly enough to act on.
4. REASONING — a genuine argument for why this settlement is right. "They're both right in their own way" or a restated conclusion is not reasoning.

Only mark depth_ok TRUE if all four are clearly present AND the reasoning is substantive (it explains WHY, not just WHAT). When genuinely uncertain, mark it FALSE.

FRAMEWORK A:
{{framework_a}}

FRAMEWORK B:
{{framework_b}}

The expert's RESOLUTION note:
{{explanation}}

Respond with ONLY a JSON object, no markdown, no code fence:
{
  "depth_ok": true or false,
  "present": {
    "both_positions": true or false,
    "dividing_line": true or false,
    "resolved_guidance": true or false,
    "reasoning": true or false
  },
  "note": "one short sentence on what's strong or what's missing, shown to the resolver"
}
