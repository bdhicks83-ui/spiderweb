# 🕷️ Spiderweb — Phase 1: "It Remembers"

**Exit test:** approve 20 real insights in under 5 minutes.
**Rule:** one step at a time. Don't read ahead.

---

## ✅ Week 1 — Foundation (do these in order)

### Step 1 — Create the Supabase project
1. Go to [supabase.com](https://supabase.com) → New project → name it `spiderweb`
2. Open **SQL Editor** → paste all of `supabase/schema.sql` → Run
3. **Authentication → Providers** → make sure **Email** is enabled

### Step 2 — Local setup
```bash
cd spiderweb
npm install
cp .env.example .env.local
```
Fill in `.env.local` with the URL + anon key from Supabase → Project Settings → API, and your Anthropic key.

### Step 3 — Run it
```bash
npm run dev
```
Open http://localhost:3000 → click Log in → magic link → you should see **"Pending insights: 0"**.

### Step 4 — Deploy
1. Push this folder to a GitHub repo
2. [vercel.com](https://vercel.com) → New Project → import the repo
3. Add the same env vars from `.env.local` in Vercel's settings
4. Deploy. Log in on the live URL.

**Week 1 done when:** you can log in and see the empty dashboard live on the internet. Stop here. 🎉

---

## 🗺️ What's already stubbed for later

| Week | What | Where |
|---|---|---|
| 2 | Upload flow + Claude OCR | `src/lib/claude.ts → extractText()` (ready), upload UI (todo) |
| 3 | Insight extraction + approval screen | `extractInsights()` (ready), `src/inngest/functions.ts` (stub), approval UI (todo) |
| 4 | Error handling + exit test | `sources.status = 'failed'` column already in schema |

## 📁 Layout
```
spiderweb/
├── prompts/           ← prompts versioned like code (doctrine)
├── supabase/schema.sql ← run once in Supabase SQL Editor
└── src/
    ├── app/            ← pages: dashboard, login, auth callback, inngest endpoint
    ├── lib/            ← supabase clients + claude wrapper
    └── inngest/        ← background jobs (Week 3)
```

## 🚫 Not in Phase 1 (kill list — don't revisit)
Multi-agent architecture · Neo4j · auto-publishing · autonomous outreach · marketplaces
