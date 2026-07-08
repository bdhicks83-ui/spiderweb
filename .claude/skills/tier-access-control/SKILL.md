---
name: tier-access-control
description: How tier gating works in Spiderweb (Phase 4) - the plan column, tier-to-department map, and testing pattern. Use when touching anything pricing, tier, or locking related, adding departments, building Stripe later, or debugging "wrong cards locked."
---

# Tier Access Control

## How it works
- profiles.plan (text, default 'free') — the single source of tier truth
- Server-side helper maps plan -> unlocked department keys
- Dashboard renders locked cards greyed with "Upgrade to X — $Y/mo to unlock"
- No Stripe yet — plan is set manually in Supabase for testing

## Tier -> department map (matches STRATEGY.md pricing, departments-not-tokens)
| Plan | Unlocks |
|---|---|
| free ($0) | Knowledge only |
| professional ($49/mo) | + Chief of Staff, Communication |
| executive ($149/mo) | + Research, Project Acceleration, Commercialization |
| legacy ($299/mo) | + Career Intelligence |
| enterprise ($499-999/mo) | everything (+ Analytics, Marketplace) |

## Testing pattern
```sql
-- Confirm the row + id first (profiles has NO email column!)
SELECT * FROM profiles LIMIT 5;
-- Then flip tiers by id:
UPDATE profiles SET plan = 'professional' WHERE id = '<uuid>';
```
Run -> refresh dashboard -> verify locks flip. Test BOTH directions (upgrade unlocks, downgrade re-locks).
Brian's account is currently set to **executive** for testing.

## When Stripe arrives (future)
- Stripe webhook becomes the ONLY writer of profiles.plan (manual SQL becomes test-only)
- Gating logic doesn't change — it already reads plan and doesn't care who set it
- Pricing amounts live in STRATEGY.md and are ALWAYS report-back to Brian (Doctrine #2 boundary) — never adjust autonomously
