---
name: airtable-api
description: Everything needed to read and write Brian's Leadership in Transit Airtable base without trial-and-error - table and field IDs, API gotchas (search returns IDs only, typecast required), and content rules. Use for ANY Airtable operation - content queries, connection building, framework updates.
---

# Airtable API — Leadership in Transit

## Base: appV7vsagYFlfxLsG (live system of record for content)

| Table | ID |
|---|---|
| Articles | tblEn56ltATeXxCl8 |
| Sections | tblmjofwCp5S85zJG |
| Connections | tbl4KWYJudJI19dZY |
| Frameworks | tblfEMr8yViLqPUHu |

## Field IDs
**Sections:** Body fldykleIYMSS2MKw2 · Status fldtQRFIwJyC1tByh · Keyword fldO0UZhJA5aYLuAL · Article link fldt9dL9RN23iOiza
**Connections:** Name fldG6v4qGrmk322wR · Section A fldCMoaRHwzIPxuQg · Section B fldaMAOYhYhHVKiLB · Type fldag1S98O0r5naoi · Strength fldysBIIis2hD3yoH
**Frameworks:** Title fldrh8IcEGEvw33yb · Description fldmUVMPDiFFbTdG7 · Linked Sections fldAhscrFBxil7s9t

## API gotchas (all confirmed the hard way)
1. **search_records returns record IDs ONLY** — no content. Follow up with list_records_for_table using explicit fieldIds + recordIds.
2. **Writes require tbl... IDs**, not table names.
3. **typecast: true required** on all creates/updates.
4. **Rollup/count field types unavailable via API** — use COUNTA formula fields instead (Hub Score on Sections works this way).
5. Keyword search (e.g., "trust") in Sections reliably surfaces thematically relevant records — then fetch content per gotcha #1.

## Freshness rule
Live Airtable queries beat MASTER-STATE.md for current inventory — MASTER-STATE lags when the Web Weaver agent runs in parallel. When counts matter, query directly.

## Content rules (NEVER break)
1. Nothing finalizes in Airtable without explicit Brian sign-off
2. Consent required for real people's content
3. No verbatim scraping — fresh writing only
4. **Termination content NEVER mixes with talent-upgrade content** (hard editorial rule)
