# Folio

A personal subscription manager with reviewable discovery, usage evidence, renewal decisions, and controlled browser execution.

Live: https://folio-subscription-manager.vercel.app

## Run

Requires Node 24. Vercel uses the same pinned runtime.

```sh
npm install
cp .env.example .env
npm run dev
```

Open http://localhost:3000. Production:

```sh
npm run build
npm start
```

Each browser starts in an isolated **Demo** workspace, identified by a random HttpOnly, SameSite=Lax cookie. Start **Personal** before adding or importing your own subscriptions. A private recovery code restores access on another browser; JSON backup preserves the workspace independently of that cookie.

## What it does

- Shows monthly equivalent cost, actual scheduled billing amounts, and subscription composition in a donut chart. Annual costs are normalized only in monthly averages; future renewals are forecasts, never invented transactions.
- Imports card CSVs with header detection, editable mapping, date/sign conventions, conservative merchant recognition, refund/currency reporting, recurring candidates, explicit merges, and charge history. Single charges remain unselected possibilities.
- Parses multiple MIME `.eml` receipts, including multipart, HTML, base64 and quoted-printable. Extracted facts retain source excerpts; unknown fields require review. Limits: 20 receipts, 500 KB each, 2 MB combined. Attachments are not extracted.
- Collects typed usage evidence, quick renewal check-ins, browser-visit aggregates, and optional read-only account-page inspection in Kernel. Evidence drafts persist across server instances and can be edited or deleted.
- Uses one deciding observation for utilization, verdicts and recommendations. Browser visits alone never establish non-use; shared/background value and missing or stale evidence are respected.
- Saves Exa research and source-quoted plan offers. Prices require confirmation and expire after 30 days. Usage evidence stops driving savings decisions after 60 days. Dismissed opportunities stay dismissed until restored.
- Provides renewal decisions, Keep for this billing cycle, a return-visit summary, a revocable private ICS calendar, and separately labeled projected/user-recorded/demo reductions.
- Prepares exact controlled changes for cancellation, downgrade, annual billing and data migration. Approval binds the originating terms, selected offer and effective date; expiry, discard and fresh re-preparation prevent stale replay.
- Executes only against independent hosted test merchants with two flow variants. Kernel operates visible controls. Completion requires a server-side merchant receipt and exact state verification; migrations compare exported/imported document content. A separate explicit step applies a verified result to a Demo ledger.
- Records changes the user performed at their own merchant, including future cancellation dates and scheduled plan terms. Pasted confirmation text supplies an editable suggestion, not proof. Later imported charges after cancellation are flagged.
- Exports/imports versioned JSON, rotates/revokes hashed recovery codes and calendar tokens, and deletes workspace data and related sessions. Restored actions are historical and cannot execute.
- Offers a contextual assistant with bounded conversation history and safe internal subscription links. Chat cannot execute changes.

## Integrations and data flow

| Configuration | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon Postgres: workspaces, short-lived sessions, access-token hashes and shared rate limits |
| `NEON_AI_GATEWAY_BASE_URL` | Gateway URL; `/v1` is appended if absent |
| `NEON_AI_GATEWAY_TOKEN` | Gateway credential; `OPENAI_API_KEY` is a supported fallback variable |
| `AI_MODEL` | Gateway model ID; defaults to `gpt-5-mini` |
| `KERNEL_API_KEY` | Cloud browsers for read-only personal inspection and controlled merchant execution |
| `EXA_API_KEY` | On-demand pricing and alternative research |
| `PUBLIC_APP_URL` | Public origin for controlled merchants and calendar links; Vercel production URL is the fallback |
| `COOKIE_SECURE` | Set `true` on HTTPS deployments |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional Gmail read-only OAuth |
| `GOOGLE_REDIRECT_URI` | Exact registered Gmail OAuth callback |

Credentials remain server-side. Folio uses only the configured Neon Gateway, with schema validation for structured model results. Invalid extraction fails without saving partial results. When pricing excerpts cannot substantiate an offer, research can return a clearly labeled source-only comparison with no prices; ungrounded offers are discarded. Integration badges show configuration, not provider health.

Neon stores subscription records, evidence, research, outcomes and action history. The Gateway receives the relevant receipt/page text, research sources or bounded assistant context. Exa receives the service and plan search query. Kernel hosts the browser you open; personal inspection saves only reviewed evidence, never screenshots. Controlled merchant runs may retain a synthetic confirmation screenshot. Backups omit recovery codes, calendar tokens, browser URLs and merchant capabilities. Calendar feeds contain subscription names, amounts and dates only.

Without `DATABASE_URL`, local development uses file-backed workspaces and in-memory temporary sessions/tokens. Neon is required on Vercel. Gmail stays unavailable unless both OAuth credentials are configured; receipt uploads work independently. The browser companion extension exports local aggregates for chosen service domains, not browsing history or past time-spent estimates.

## Vercel

The Vite frontend is served from the CDN. `api/index.ts` exports the Express API, with a 300-second function limit in `vercel.json`.

```sh
vercel link
# Configure production variables listed above, including COOKIE_SECURE=true.
vercel --prod
```

Secrets, local data, test artifacts and skill directories are excluded from deployment. The temporary tunnel's `PREVIEW_ACCESS_TOKEN` is not part of production. For Gmail, enable the Gmail API, configure a consent screen/test user, and register `https://YOUR_DOMAIN/api/gmail/callback`; the scope is `gmail.readonly`.

## Demo walkthrough

1. Review monthly cost, upcoming payments and the composition donut in Demo.
2. Open Adobe Creative Cloud and inspect the deciding sample evidence. Review an exact cancellation at the end of its billing period.
3. Approve the controlled change and watch activity. Completion must match independently stored merchant state.
4. Apply the verified result to the Demo ledger; a future end date remains pending until that date.
5. Try Notion migration. Synthetic documents must be exported, imported and compared before success.
6. Switch to Personal, import a statement or receipt, review candidates, and add a renewal check-in. Confirm real offer terms before counting a lower-plan price.
7. Record an independently completed personal change; create a backup/recovery code or subscribe to the private calendar.

## Checks

```sh
npm run check
npm test
npm run build
# With the local server running:
npm run test:integration
npm run test:ownership
# With DATABASE_URL configured:
npm run test:persistence
# Explicit live Gateway + Exa smoke test; synthetic data, disposable workspace:
npm run test:ai:live
# Real Kernel browsers, eight synthetic merchant cases against the public deployment:
MERCHANT_CONCURRENCY=2 npm run test:merchant:live
```

Set `TEST_BASE_URL` to check a hosted deployment. Unit tests cover billing boundaries, evidence decisions, import/source validation, lifecycle, backups and calendar privacy. Integration tests use disposable workspaces and test persistence, isolation, recovery, revocation and deletion. See [the agreed roadmap](docs/roadmap.md) and [review records](docs/reviews) for acceptance requirements and reviewer agreement.

## Limits

All automated merchant writes are **controlled tests**, not real account cancellations or migrations. Illustrative prices never represent verified merchant offers. Personal recorded reductions are user-attested and may be projected; they are not bank-verified realized savings.

There is no bank connector, identity-provider login, background crawling, email/push reminder, additional currency/cadence support, or Chrome Store publication. Account inspection requires the user to sign in and navigate to their usage page. Browser-only evidence misses mobile, offline, shared and background value.

On Vercel, approved jobs continue via `waitUntil`. This is not a durable job queue: interrupted jobs require a newly prepared proposal and approval. Private recovery codes and calendar links grant access to their respective data; rotate or revoke them if shared. Generic ICS output is tested locally; Google/Apple Calendar import is not claimed without a separate check.

## Stack

React, TypeScript, Vite, Express, Neon Postgres, Mastra, Neon AI Gateway, Kernel, Exa, Assistant UI and Lucide. The established green design, bundled real company logos and composition donut are preserved. The earlier Impeccable report is in [docs/impeccable-audit.md](docs/impeccable-audit.md).
