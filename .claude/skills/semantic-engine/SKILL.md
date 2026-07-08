---
name: semantic-engine
description: How Spiderweb's connection and cluster intelligence works - embeddings, the 0.82 threshold, orbit cluster model, and framework drafting flow. Use when tuning match quality, debugging missing connections or clusters, extending Phase 2/3 features, or explaining why two insights did or didn't link.
---

# Semantic Engine

## Pipeline (fires on Approve)
1. Insight approved -> /api/embed-insights
2. Voyage AI (voyage-large-2, 1536 dims) embeds the content
3. match_insights Postgres fn: cosine similarity vs all past insights
4. Pairs above **0.82** saved to connections

## The 0.82 threshold
- Validated: real match at 0.9148 with ZERO shared keywords (proof it's semantic, not lexical)
- Real cluster pairs landed 0.85-0.91
- Tune cautiously; below ~0.80 expect noise. Log any change in DECISION-LOG.

## Cluster model: loose orbit (decided over strict cliques)
- Cluster = hub insight + **2+ members** above 0.82 to the hub (member_count 2 = 3 total)
- NOT pairwise-complete — members need only relate to the hub
- Same-source pairs EXCLUDED (an upload clustering with itself is noise)
- Deduped; computed on the fly by detect_clusters — no persisted cluster table
- Why: matches how thinking works — the goal is "surface a framework the user didn't know they had," not "find similar text"

## Framework drafting (Phase 3)
- **Manual trigger only** — "Draft Framework" button per cluster card. No auto-generation until draft quality is trusted long-term.
- /api/draft-framework -> Claude drafts name + description + short write-up (deliberately thin)
- Lives in Supabase frameworks table (draft/approved/archived) — NOT Airtable, to avoid polluting the trusted system of record
- Approve = deliberate action; re-draft of an approved framework requires explicit "Replace approved version..." confirmation

## Debug: "expected a connection or cluster, none appeared"
1. Do both insights have embeddings? (embed fires on Approve — unapproved = no embedding)
2. Similarity actually above 0.82? Check the pair in connections
3. Same source? Excluded by design
4. Cluster needs hub + 2 — two related insights alone won't cluster
