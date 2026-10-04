I found two concrete defects to fix before the final push. I reproduced both with in-memory scripts that write nothing to the database. I made no edits or commits.

## Findings

### 1. Workspace export fails after a normal multi-receipt import (High, breaks roadmap item 10's backup round-trip)

- **Where:**
  - `server/imports.ts:752-754`: merged receipt excerpts are joined and capped at 4000 characters.
  - `server/imports.ts:802`: `candidateSchema.sourceExcerpt` allows up to 4000.
  - `server/imports.ts:905-908`: the excerpt is saved as a `Receipt` evidence summary.
  - `shared/backup.ts:36`: the backup schema caps evidence `summary` at 3000 (`text()`).
- **Trigger:** Import several receipts for the same service and plan, such as a year of monthly receipts. Each new excerpt is appended to the previous one, so the total quickly passes 3000 characters. A single receipt excerpt is already capped at 1600, so two long receipts are enough.
- **Actual result:** `exportBackup` throws while validating the schema, so `GET /api/workspace/export` fails and the user cannot back up the workspace. Reproduced: `export failed: workspace.subscriptions.0.evidence.0.summary Too big: expected string to have <=3000 characters`.
- **Minimal fix:** Use the same limit everywhere. Cap the merged excerpt at 3000 (`.slice(0, 3000)` at line 754) and set `candidateSchema.sourceExcerpt` to `.max(3000)`. The other option is to raise the backup evidence `summary` limit to 4000. Either way, add a round-trip test with a long merged excerpt.

### 2. The demo loses three of the four controlled change types after 30 days (Medium, breaks items 5, 7 and 8 for returning demo visitors)

- **Where:**
  - `shared/demoOffers.ts:23-24`: demo offers set `checkedAt` and `confirmedAt` to `sub.createdAt`.
  - `shared/lifecycle.ts:57-63`: migration only adds missing demo offers and never refreshes existing ones.
  - `shared/domain.ts:78-84`: `offerIsFresh` applies the 30-day freshness rule to every offer.
  - `server/actions.ts:46-59`: `prepareAction` requires a fresh offer.
- **Trigger:** Any demo workspace older than 30 days. The workspace cookie lasts 365 days, and nothing re-seeds or refreshes the demo.
- **Actual result:**
  - The demo "Starter", "Annual" and "Replacement" targets become stale.
  - Lower-plan, annual and alternative suggestions disappear, and the remaining downgrade shows $0 as unpriced.
  - Preparing a downgrade, yearly or migrate change fails with "Confirm a fresh target offer for this change first."
  - `confirmOffer` also rejects them as stale, so the user has no way to recover.
  - Only cancellation still works. Reproduced: with offers aged 31 days, recommendations were `cancel:59.99 downgrade:0.00 cancel:13.99`, and `prepareAction(figma, downgrade)` failed.
- **Minimal fix:** In `migrateWorkspace`, for `source === "Demo"` subscriptions, refresh `checkedAt` and `confirmedAt` on stale `provenance: "demo"` offers. Skip any subscription with an `awaiting_approval` or `running` action, because the fingerprint covers offers. The other option is to exempt demo-provenance offers on Demo subscriptions from the 30-day rule in `offerIsFresh`. These targets are labeled illustrative, so the 30-day freshness rule has no meaning for them.

## Checked with no defect found

- **Hosted merchant:**
  - Run tokens are 256-bit, stored hashed and revoked in `finally`.
  - Merchant state changes only through `operate()` behind the token, using a compare-and-swap update.
  - The Folio action API does not write merchant state.
  - The agent may only click exact visible buttons, and the run stops if the browser leaves the merchant page.
  - Confirmation terms are checked before submission, and the server checks merchant state independently.
  - Scheduled and immediate changes use consistent UTC dates, so end-of-period cancellations and downgrades stay scheduled.
  - Migration checks that the exported and imported documents match.
  - The two variants use distinct labels and decoys.
- **Approvals:**
  - Approval is claimed atomically under a compare-and-swap update, and duplicate or concurrent approvals are rejected.
  - Proposals check the fingerprint, expire after 24 hours, and require a fresh offer.
  - Discard and re-prepare behave as specified.
  - Interrupted runs are marked failed after 6 minutes and are never replayed.
  - Demo apply requires both demo mode and a Demo-source subscription, is idempotent, and supersedes other pending proposals.
  - A personal controlled test cannot produce a recorded saving.
- **Ownership:** Backups drop tokens, live-view and browser IDs, merchant run IDs and fingerprints. Restored actions become `historical`. Delete and import refuse to run during a write and clean up merchant records, sessions and tokens. Recovery and calendar tokens are 256-bit and hashed, and the calendar excludes cancelled and ended renewals.
- **Research:** A price is accepted only with a verbatim quote containing the USD amount and billing cycle, and an edited extracted offer must be saved as a user offer.

I did not treat the 8 Kernel runs that are still in progress as missing work.
