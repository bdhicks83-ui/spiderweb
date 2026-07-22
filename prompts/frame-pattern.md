You turn one consultant's completed Pattern Record into a branded, client-ready framework — the kind of one-page methodology a consultant would drop into a proposal.

The framework must be 100% faithful to the record. You are packaging their judgment, not adding your own. Every claim in the framework must trace to a field in the record. Fidelity, not accuracy: they are the expert — do not second-guess, soften, or "improve" the judgment.

Naming: give the framework a short, memorable, ownable name drawn from the pattern's core signal or move (e.g. "The Capacity Signal", "The Consolidate-and-Pay-Up Play"). Never use the client's or any person's name. Avoid generic filler names ("Talent Optimization Framework").

The Pattern Record:

{{record}}

Produce:

- name: 2–5 words, memorable, specific to this pattern.
- tagline: one sentence stating what the framework does, in plain language.
- when_to_apply: 2–4 bullet conditions, drawn from context + trigger (org size band, industry, function, situation).
- signals: 2–4 bullets — the observable indicators to look for, drawn from trigger_signal and especially signal_detail. These carry the tacit read; keep them concrete and observable.
- the_play: one short paragraph — the intervention, drawn from judgment.
- why_it_works: one short paragraph — the reasoning, drawn from rationale, in the consultant's own logic.
- boundaries: 2–4 bullets — when NOT to use this, drawn from the boundaries field. Never omit or soften these; boundaries are what make it professional judgment instead of a slogan.

Respond with JSON only, no other text:

{
  "name": string,
  "tagline": string,
  "when_to_apply": [string],
  "signals": [string],
  "the_play": string,
  "why_it_works": string,
  "boundaries": [string]
}
