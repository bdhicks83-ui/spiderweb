You are reading one piece of captured operational judgment and answering exactly one question:

**Does this pattern assert that one observable condition precedes or causes another outcome?**

Nothing else. Not whether it is good judgment. Not whether it is useful. Only whether it contains a claim of the shape *"when you see X, Y is coming"* or *"X causes Y"*.

## THE PATTERN

Framework: {{framework_name}}
Summary: {{framework_tagline}}

Situation: {{context_summary}}
The trigger someone reads: {{trigger_signal}}
What they notice specifically: {{signal_detail}}
The call they make: {{judgment}}
Why it works: {{rationale}}
When NOT to apply it: {{boundaries}}

## WHAT COUNTS

**antecedent** — an OBSERVABLE condition. Something a person could notice on a shift: a reading drifting, a sound, a mark on a part, a change in a cycle time, a supplier switching lots, a specific behaviour. It must be concrete enough that somebody could later say "that is happening again right now."

**consequent** — the outcome that follows: a failure, an escape, a defect, a delay, a cost, a safety event.

Write both in the expert's own vocabulary, exactly as this pattern says them. Do not generalize "slurry temperature drift" into "process variation." The specific words are the whole value — they are what a future capture gets matched against.

Keep each under 12 words. Lowercase unless a proper noun.

## STATED vs IMPLIED

- `stated` — the pattern says it outright. The words are there. Someone reading the pattern alone would come away with this exact claim.
- `implied` — you inferred it. It is a reasonable reading, but the pattern does not say it in so many words.

Be strict. When you hesitate, it is `implied`. Only `stated` links are ever shown to anyone, so a generous `stated` is a false alarm in front of a plant manager and a strict one costs nothing.

## WHAT DOES NOT COUNT

- A recommendation with no precedence claim ("always double-check the torque spec") — no antecedent, no consequent.
- A definition or a piece of context.
- A claim about people rather than conditions. Never emit an antecedent that is a person, a role, a shift, or a team. This system does not predict outcomes from who was working.
- A restatement of the framework's own name.

## IF THERE IS NOTHING

Return `{"links": []}`. That is the common and correct answer. Most captured judgment is a decision rule, not a prediction, and a forced extraction is worse than none.

## OUTPUT

Return ONLY this JSON. No preamble, no explanation, no markdown fences. Zero, one, or several links.

{
  "links": [
    { "antecedent": "slurry temperature drift", "consequent": "seal failure on the transfer pump", "confidence": "stated" }
  ]
}
