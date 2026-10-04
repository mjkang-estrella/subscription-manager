# Folio

A personal subscription manager with an evidence-based savings assistant and controlled browser execution.

Folio brings subscription costs, upcoming payments, usage evidence, alternatives, and exact-change approvals into one dashboard. Built for the Build Personal Agents hackathon.

## Run

Requires Node 22 or newer.

```sh
npm install
cp .env.example .env
# Configure the integrations in .env.
npm run dev
```

Open http://localhost:3000. For a production build:

```sh
npm run build
npm start
```

The app creates an isolated workspace for each browser using a random HttpOnly, SameSite=Lax cookie. New workspaces start with clearly labeled sample subscriptions. Choose **Personal workspace → Start with my subscriptions** to remove samples while keeping subscriptions you added.

## Features

- Dashboard with monthly equivalent costs, scheduled monthly charges, six-month payment projections, and savings opportunities.
- Subscription create/edit, search, sorting, category filtering, CSV export, and payment calendar.
- Card CSV import with grouped candidates, editable review, currency validation, and duplicate detection.
- Receipt text / `.eml` extraction through the gateway, plus optional Gmail read-only OAuth.
- Usage evidence from self-reporting, browser-history aggregates, or real account pages inspected in an isolated Kernel browser.
- Browser companion extension: summarizes visits to explicitly listed domains locally; exports aggregate JSON for review/import. It does not upload browsing history or estimate past time spent.
- Exa alternative research, with linked sources and a personalized gateway analysis.
- Assistant UI chat powered by Mastra and Neon AI Gateway.
- Exact-change proposals and explicit approval for cancellation, downgrade, annual billing, and migration in controlled merchant test accounts.
- Kernel execution uses an agent that chooses visible controls. Results are read back from merchant confirmation text; migration verifies exported and imported sample content.
- Persistent workspace data in Neon Postgres, with a local-file development fallback when no database is configured.

## Integrations

| Configuration                              | Purpose                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------- |
| `DATABASE_URL`                             | Neon Postgres persistence; creates only the namespaced `folio_workspaces` table |
| `NEON_AI_GATEWAY_BASE_URL`                 | Your branch's gateway URL; `/v1` is appended if absent                          |
| `NEON_AI_GATEWAY_TOKEN`                    | Gateway credential; `OPENAI_API_KEY` is a supported fallback variable           |
| `AI_MODEL`                                 | Gateway model ID; defaults to `gpt-5-mini`                                      |
| `KERNEL_API_KEY`                           | Private account browsers and controlled test execution                          |
| `EXA_API_KEY`                              | Alternative and pricing research                                                |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional Gmail read-only OAuth                                                  |
| `GOOGLE_REDIRECT_URI`                      | Exact callback URI registered in the Google OAuth application                   |

API keys stay server-side. Folio does not fall back to a different model provider. Integration badges indicate configuration, not provider health. Gmail tokens stay in server memory and expire; reconnect after a restart or expiry.

For Gmail, enable the Gmail API in your Google Cloud project, configure an OAuth consent screen, add your account as a test user, and register the redirect URI. The app requests `gmail.readonly`. Receipt import can be used without Gmail OAuth by uploading `.eml` or pasting receipt text.

## Demo walkthrough

1. Explore the sample dashboard and distinguish **Average monthly cost** from **Scheduled this month**. Annual plans are divided by twelve only in the average.
2. Open Adobe Creative Cloud. Review the sample account evidence and cancellation recommendation.
3. Choose **Review test change**. Inspect the old/new price, effective date, and consequences, then approve.
4. Watch Kernel navigate the isolated merchant test page. Completion requires reading back the correct resulting state.
5. Try **Actions → Migrate to an alternative** on Notion. Three sample documents are exported, imported, and compared before completion is recorded.
6. Import your own card CSV or receipts, and add real usage evidence. Real records remain independent of sandbox results.

## Scope and limitations

- **All write actions are sandbox-only.** They operate isolated merchant fixtures loaded into real Kernel browsers. They do not cancel or migrate a real service. Test-plan prices are explicitly illustrative. The runner is generic over visible button names, but real-world merchant compatibility is not claimed.
- Real account inspection is read-only from the agent's side. The user signs in and navigates to a usage page in the live browser, then reviews the extracted draft. Sessions expire and are closed after saving.
- Payment projections are based on saved billing schedules, not confirmed bank transactions. Bank aggregation is not implemented; use CSV imports.
- The usage companion sees only browser visits in the selected time window. Mobile use, offline use, shared accounts, data dependencies, and subscription benefits require other evidence. Missing/stale evidence never automatically becomes zero usage.
- Cancellation savings are hypothetical. Non-demo downgrade savings remain unknown until actual plan pricing is verified.
- Receipt `.eml` import handles text content via the model; complex MIME/attachment extraction is not implemented.
- This is a single-server hackathon application. Workspace cookies provide isolation, not an account recovery/login system. Use `PREVIEW_ACCESS_TOKEN` when sharing a preview; full public multi-user hosting requires user authentication, distributed job locking, and a durable worker queue.
- Running browser jobs are process-local. A server restart interrupts execution; stale jobs are marked for review rather than retried automatically.

## Checks

```sh
npm run check
npm test
npm run build
# With the local server running:
npm run test:integration
```

Unit tests cover annual/monthly billing, calendar clamping, unknown and stale usage, browser-only evidence, candidate grouping, price/date validation, and safe fixture content. API tests create their own disposable workspace and verify persistence, isolation, editing, import deduplication, and request-origin protection.

Live integration verification during development covered the gateway, Neon storage, Exa research, and all four Kernel sandbox actions: cancellation, downgrade, annual billing, and migration. The screenshot in `docs/dashboard.png` shows sample data only.

## Stack

React + TypeScript + Vite, Express, Neon Postgres, Mastra, Neon AI Gateway, Kernel, Exa, Assistant UI, and Lucide icons.

## UI audit

The Impeccable audit and remediation report is in [docs/impeccable-audit.md](docs/impeccable-audit.md). It records the fixed findings, automated checks, keyboard and responsive checks, and remaining testing limits.
