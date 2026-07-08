---
name: inngest-background-jobs
description: How background jobs work in Spiderweb via Inngest - the 3-step retryable pattern, the permanent-URL sync gotcha that silently kills jobs, and how the Vercel integration handles keys. Use whenever creating or modifying background jobs, debugging "the job never ran," or anything async that should not block the UI.
---

# Inngest Background Jobs

## The pattern (copy it)
Long AI work NEVER runs synchronously in an API route. The route validates + fires an event; Inngest does the work.

```
/api/extract-insights  ->  validates source_id, fires event, returns fast
src/inngest/functions.ts  ->  3 retryable step.run() stages:
   1. fetch source
   2. Claude extraction
   3. save insights
```

Each step.run() is independently retryable — a Claude API hiccup doesn't redo the fetch.

## THE gotcha: permanent URL sync
Inngest syncs against an app URL. If that URL is a per-deployment URL (spiderweb-gozitgwna-...), **every new deploy silently breaks the connection** — events fire, nothing runs, no errors surface.

- Synced URL MUST be spiderweb-nine.vercel.app
- Fix if broken: Inngest dashboard -> app -> resync via **Override Input** with the permanent URL

## "Job never ran" debug order
1. Check Inngest dashboard — did the event even arrive?
2. Event arrived but no run -> check synced app URL (above)
3. Run started but failed -> which step.run() failed? Service-role client in use?
4. Nothing arrived -> is the API route actually firing the event? (Real bug: upload page only called the OCR route and never extract-insights for ANY upload type.)

## Keys
Connected via Inngest's **native Vercel integration** — all 4 env vars (event + signing, prod + preview) auto-injected. Never hand-copy Inngest keys; if keys look wrong, reconnect the integration instead.

## Deployment Protection note
Vercel "Require Log In" protection is ON and confirmed compatible with the native integration — no bypass token needed. Don't disable protection to "fix" Inngest.
