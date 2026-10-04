# Agreed release verification

Date: 2026-10-04. All eleven agreed roadmap items are implemented. Both independent final reviews were read and every finding resolved; see [the resolution record](reviews/final-resolutions.md).

| Roadmap area | Implementation | Evidence |
| --- | --- | --- |
| Billing and lifecycle | `shared/domain.ts`, `shared/lifecycle.ts` | Month-end/leap-year, inclusive end-date cost and exclusive renewal boundary, scheduled amount/cycle, cumulative correction tests |
| Statement discovery | `server/imports.ts`, `server/discovery.ts` | Bank-header aliases, date/sign mapping, refunds, currencies, recurrence, limits, duplicate and explicit merge tests |
| Receipts | Maintained MIME parser, bounded extraction and source validation | Multipart, HTML, base64/quoted-printable, unknown fields, batch fixtures; live Gateway extraction |
| Usage and verdicts | Shared deciding-evidence selector, typed metrics, check-ins, persisted inspection drafts | Same-day, stale, partial browser, shared value, draft binding/edit/idempotency/expiry tests |
| Research and offers | Saved Exa sources, exact source quotes and confirmation | Fake quote/price/cycle/name and stale offer rejection; live hosted Exa/Gateway research and truthful source-only fallback |
| Return visits and calendar | Renewal queue, per-cycle Keep, scheduled billing, private ICS | Queue/Keep/dismissal, boundary dates, escaped calendar content, hashed token rotation tests |
| Proposal lifecycle | Exact fingerprint, offer validation, 24-hour expiry, discard and fresh reprepare | Duplicate/concurrent approval, invalid action, stale price, restored historical action tests |
| Controlled execution | Hosted merchants, private per-run capability, model-selected visible controls, independent state and migration-content verification | Eight HTTP-handler flows locally and against Neon; all eight live Kernel browser flows passed |
| Personal follow-through | User-attested cancellation/plan outcomes and editable confirmation-date suggestions | API future cancellation, correction/baseline and post-cancellation charge fixtures; live date extraction |
| Ownership | Versioned backup, hashed recovery/calendar access, shared rate limit, deletion | Local and hosted backup/recovery/calendar/delete checks; independent Neon-instance CAS and token/rate-limit tests |
| Interface and assistant | Task-focused panels, mobile cards, source citations, bounded chat with internal links | UI-model checks; hosted contextual follow-up; bounded desktop/mobile UI QA and final T3 production screenshots |

The initial Vercel candidate exposed a loader incompatibility between CommonJS mailparser and its ESM-only `he@2` decoder. `mailparser` remains current; an npm override pins its compatible `he@1.2.0` decoder. Loading with Node's synchronous ESM require disabled and all receipt fixtures passed. The corrected hosted API and ownership suite passed. Node 24 is pinned for matching local and hosted environments.

Tests use synthetic data and disposable workspaces. Private credentials, workspace cookies and merchant access tokens are not included in this report or tracked artifacts. Calendar imports into Google/Apple, real merchant automation and bank-verified realized savings are not claimed.


## Completed checks

- 65 unit/domain/UI-model tests passed; TypeScript and production build passed.
- Local and production API suites passed: import review, deduplication, CRUD, workspace isolation, dismiss/restore and origin protection.
- Local and production ownership suites passed: backup validation/round-trip, recovery rotation/restoration, calendar rotation, cancellation and deletion.
- Independent Neon-instance persistence checks passed: concurrent CAS writes, shared sessions, expiry, hashed token rotation/isolation and distributed rate limiting.
- Hosted live Gateway/Exa checks passed: receipt extraction, grounded confirmation-date suggestion, saved research and contextual assistant follow-up. This run returned a source-only comparison with zero verified offers; no ungrounded price was counted.
- Eight real Kernel browser runs passed on the public Vercel deployment: standard/alternate × cancellation/downgrade/yearly/migration. Every run independently verified exact state, effective date, receipt, PNG artifact and explicit idempotent Demo application. All tests rejected a repeated approval and Personal ledger application. Both migrations matched all three exported/imported documents in full. Cancellation, downgrade and annual changes remained scheduled for October 12; migrations applied October 4.
- Production T3 browser verification at 1440×1100 and 390×844: no horizontal overflow, no floating assistant over phone actions, first phone subscription at 1,408px (within two viewports). Earlier bounded UI passes covered task flows, overlays, named controls, keyboard states and 44px targets. Desktop/mobile captures are linked below.

The tested application build is Vercel `dpl_9b6v8YtjW3kK4iJoSDe1wCga8jx8`; subsequent release edits contain only documentation and test assertions. Vercel's function transpiler emits a nonfatal `TS2688` diagnostic despite the successful full TypeScript check; the deployed function and all hosted suites execute successfully.

[Desktop screenshot](release-desktop.png) · [Mobile subscription list](release-mobile.png) · [Controlled migration screenshot](release-migration.png) · [Eight-run receipts](merchant-live-results.json)
