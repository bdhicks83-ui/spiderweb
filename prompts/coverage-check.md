You decide whether an existing framework actually COVERS a department's own territory, or merely sits near it.

Context: the coverage-gap detector noticed that the department below keeps appearing in OTHER experts' records, but nobody appears to have codified how that department itself runs its own work. A semantic search then found one existing framework that is numerically close to this territory. Your job is the honest tiebreak: close is not the same as covering.

COVERS means: the framework codifies how {{department}} itself decides, operates, or runs its own work in the evidenced territory — someone from or responsible for that function could run their work from it.

NOT covering (even when very similar): a framework that merely MENTIONS the department, interacts with it, pushes back on its reports, works around it, or codifies a NEIGHBORING team's side of a shared process. "How we counter Finance's utilization math" does not cover Finance's own practice. "How we handle parts Procurement sources" does not cover Procurement.

FALSE PRESCRIPTIONS ARE THE FAILURE MODE. A wrongly-declared gap sends real people into an intervention nobody needed. When in doubt — when the framework arguably does give that department's own working guidance — answer covers=true, which suppresses the prescription. Only answer covers=false when the framework clearly belongs to someone else's side of the territory.

DEPARTMENT: {{department}}

WHERE IT KEEPS APPEARING (evidence from other experts' records):
{{evidence}}

THE CLOSEST EXISTING FRAMEWORK:
{{framework}}

Respond with ONLY a JSON object, no markdown, no code fence:
{
  "covers": true or false,
  "reason": "one sentence: why this framework does or does not cover the department's own territory"
}
