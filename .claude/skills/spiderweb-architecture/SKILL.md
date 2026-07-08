---
name: spiderweb-architecture
description: The authoritative map of the Spiderweb / Human Bloom codebase, database, and infrastructure. Consult this FIRST in any session touching the Spiderweb app - before writing SQL, before creating API routes, before assuming a column exists. Triggers - any work on the repo bdhicks83-ui/spiderweb, Supabase queries, schema questions, env vars, deployment URLs, or "where does X live" questions.
---

# Spiderweb Architecture

## Golden rules
1. **Look here BEFORE exploratory SQL** — saves round-trips.
2. **The permanent URL is `spiderweb-nine.vercel.app`** — never use random per-deployment URLs (`spiderweb-gozitgwna-...`). Using a temp URL in any integration (Inngest, webhooks) silently breaks on next deploy.
3. **The real repo lives at** `C:\Users\BDHIC\Claude\Projects\LIT Repository\spiderweb`. The folder `C:\Users\BDHIC\human-bloom` is boilerplate garbage — NEVER edit there.

## Stack (locked — do not propose alternatives)
- Next.js / TypeScript
- Supabase (Postgres + pgvector)
- Inngest (background jobs, native Vercel integration)
- Vercel hosting
- Claude API (extraction + OCR)
- Voyage AI embeddings (voyage-large-2, 1536 dims)
- **NO agent frameworks, NO LangChain, NO Neo4j** — killed deliberately

## Database schema

### sources
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | direct, no join |
| kind | text | defaults 'text' |
| storage_path / file_path | text | nullable |
| raw_text / extracted_text | text | nullable |
| status | text | |
| error | text | nullable |
| created_at | timestamptz | |

### insights
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | **direct — no join needed** |
| source_id | uuid | |
| content | text | column is `content`, NOT `text` |
| status | text | |
| decided_at | timestamptz | nullable |
| created_at | timestamptz | |
| embedding | vector(1536) | added Phase 2 |

### connections
insight_a_id, insight_b_id, similarity — populated on Approve via /api/embed-insights

### frameworks
status: draft / approved / archived — with RLS. Deliberately separate from Airtable.

### profiles
| Column | Type | Notes |
|---|---|---|
| id | uuid | NO email column — match on id only |
| plan | text | free/professional/executive/legacy/enterprise, default 'free' |
| created_at / updated_at | timestamptz | |

## Postgres functions
- `match_insights` — cosine similarity, **0.82 threshold**
- `detect_clusters` — loose orbit model (hub + 2+ members > 0.82, same-source excluded, deduped). Derived on the fly, NOT persisted.

## RLS
- insights: ONE blanket "ALL" policy
- sources: overlapping specific + ALL policies — redundant but NOT broken. Do not "fix" without checking.

## Routes
- /upload — text + screenshot input
- /approve — one-at-a-time approval screen
- /api/extract — Claude OCR
- /api/extract-insights — validates source_id, fires Inngest event
- /api/embed-insights — embedding + match on Approve
- /api/detect-clusters, /api/draft-framework, /api/approve-framework

## Env vars (Vercel)
- ANTHROPIC_API_KEY — confirmed
- INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY — auto-injected via native integration
- VOYAGE_API_KEY — confirmed
- SUPABASE_SERVICE_ROLE_KEY — backend only!
- NEXT_PUBLIC_SUPABASE_URL + ANON_KEY — confirmed

## Refresh procedure
When schema changes, run these in Supabase SQL editor and diff-update (never rewrite) ARCHITECTURE.md:
```sql
select t.table_name, c.column_name, c.data_type, c.is_nullable
from information_schema.tables t
join information_schema.columns c on c.table_name = t.table_name
where t.table_schema = 'public'
order by t.table_name, c.ordinal_position;

select tablename, policyname, cmd, roles from pg_policies
where schemaname = 'public' order by tablename;
```
