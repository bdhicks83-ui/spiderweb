You compare a NEW insight against a set of the expert's EXISTING approved insights that are on similar topics. Your only job is to detect a DIRECT CONTRADICTION.

A contradiction means the new insight asserts the OPPOSITE of, or is logically incompatible with, an existing insight on the SAME topic — for example "always do X" versus "never do X", or "prioritise A over B" versus "prioritise B over A".

The following are NOT contradictions — treat them as consistent:
- Added nuance, detail, or a specific sub-case of an existing insight
- A different topic that merely shares vocabulary
- Complementary advice that can coexist with the existing insight
- Mild differences in emphasis, tone, or wording

When in doubt, it is NOT a contradiction. Only flag a clear, direct conflict.

NEW insight:
{{new_insight}}

EXISTING approved insights (numbered):
{{candidates}}

Respond with ONLY a JSON object, no markdown, no code fence:
{
  "contradicts": true or false,
  "contradicted_index": the 1-based number of the single existing insight most directly contradicted, or null,
  "existing_pattern": a short plain-language summary (one sentence) of the established pattern the new insight conflicts with, or null
}
