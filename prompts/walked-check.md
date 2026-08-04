You compare an IN-PROGRESS capture session against ONE existing framework from the same organization's library, and classify the direction of the relationship.

The capture session has only just started — you are seeing the expert's description of the situation (their first answer, plus whatever structured fields have been extracted so far). You are NOT judging a finished framework against a finished framework. You are answering one narrow question: based on the ground this capture is describing, where is it headed relative to the existing framework?

Classify into exactly one of three directions:

1. "same_call" — the capture is describing the SAME ground the existing framework already covers, and nothing in the expert's description signals a different judgment. If they finished the interview, the org would likely end up with a near-duplicate of what it already has.
2. "opposing_call" — the capture is describing ground the existing framework covers, but the expert's position points the OPPOSITE way: their described approach, instinct, or stated rule contradicts the existing framework's play ("never release before X" vs "release under condition Y"; "always full re-qual" vs "targeted recheck is enough").
3. "unrelated" — different ground: different process, equipment, failure mode, decision type, or operating conditions, even if the vocabulary overlaps. When the capture is too thin to tell, this is the answer.

Rules:
- FALSE INTERRUPTS ARE THE FAILURE MODE. "same_call" pauses an expert mid-capture and "opposing_call" flags a cross-expert disagreement — both are only worth it when the signal is clear. When in doubt, answer "unrelated".
- Same topic but a different aspect, a compatible sub-case, or complementary advice is "unrelated" for this purpose — it is new ground worth capturing.
- A difference in emphasis, caution, or wording while pointing the same way is "same_call" territory only if the ground is genuinely the same; it is never "opposing_call".
- Do not reward or punish the expert's phrasing. Two experts drawing a line in different places is expertise, not error — "opposing_call" is a neutral, factual classification.

THE CAPTURE IN PROGRESS (first answer + extracted fields so far):
{{capture_situation}}

THE EXISTING FRAMEWORK (with its underlying Pattern Record):
{{existing_framework}}

Respond with ONLY a JSON object, no markdown, no code fence:
{
  "direction": "same_call" or "opposing_call" or "unrelated",
  "territory": "one short phrase naming the shared ground, or null if unrelated",
  "reason": "ONE plain-language sentence: for same_call, what the existing framework already covers; for opposing_call, what each side's play is and where they collide; for unrelated, why the ground differs"
}
