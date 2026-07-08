---
name: phase-gate-process
description: The product process that got Spiderweb from zero to Phase 4 - gates not dates, real-data exit tests, ship-thin doctrine, kill lists. Use when scoping any new phase or feature, deciding build order, resisting scope creep, or judging when something is "done." Applies to future projects too.
---

# Phase Gate Process

## Core mechanics
- **Gates, not dates.** A phase closes when its exit test passes on REAL data — never on a calendar.
- **Exit tests are behavioral, not technical.** "Approving 20 insights in under 5 min feels satisfying" — not "endpoint returns 200."
- **One phase gate at a time.** Don't scope Phase N+1 until N closes.
- Roadmap so far: 0 Proof -> 1 It Remembers -> 2 It Connects -> 3 It Reveals -> 4 It Pays

## Ship-thin doctrine (Doctrine #1 applied)
- Build the smallest version that proves the mechanism, on real data
- "$0 first" ordering: exhaust free, dev-time-only work before anything costing money
- Precedent: exit tests can be called early when the mechanism is clearly proven (10-in-30-sec beat the 20-in-5-min bar -> pass)
- Post-completion real testing still matters — Phase 1 was "done," then real testing found 2 real bugs

## Scope control
- Kill list is real: multi-agent architecture, Neo4j, auto-publishing, autonomous outreach, marketplaces — killed for Phases 1-2, don't revisit
- Parking lot (STRATEGY.md) holds good-but-later ideas — park, don't debate
- Multi-agent rule: agents only get built after their workflow is executed manually 3+ times in real engagements
- "Build everything before launch" impulse -> translate into a sequenced arc of thin phases, never one mega-build

## Decision boundaries (Doctrine #2)
- Infer + execute operational decisions autonomously
- ALWAYS report-back: brand voice, pricing, anything customer-facing
- Escalate only for: strategy changes, equal-tradeoff forks, legal/ethical requirements

## Invisible Complexity (Doctrine #3)
Customers never see agents, prompts, or orchestration. No UI element exposes internals. "Spiderweb" never appears customer-facing — rename (e.g., "Knowledge Graph").
