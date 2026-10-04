Five acceptance failures. The other targeted contracts I checked — currency skips, the demo and personal savings split, demo-only ledger apply, calendar contents, and chat without writes — match the locks. I left the in-progress Demo outcome form, visit dedupe, progress polling, and compact renewal queue alone.

### 1. High — actively used subscriptions are told to switch
`shared/domain.ts:238`

Trigger: open the demo workspace. Notion was used on 21 of 30 days, iCloud is at 146 of 200 GB, and GitHub has 34 of 50 uses.

Actual result: each verdict is "Review an alternative" because the cheapest fresh offer is the migrate plan. Those dollars enter potential savings (Notion $6, iCloud $1.49, GitHub $2) and the renewal queue. The usage badge for the same records is "Actively used". Continued use does not support leaving.

Minimal fix: offer `migrate` only when the deciding evidence is unused, a "would not renew" check-in, or under 15% of its limit. An actively used subscription can still take a cheaper annual offer; otherwise the verdict is Keep.

### 2. Medium — the only "Reconfirm" action cannot succeed
`server/research.ts:211` and `src/AlternativesPanel.tsx:149`

Trigger: a confirmed offer whose `checkedAt` is older than 30 days. The Plans tab shows Reconfirm only in that state. Submit the form without editing. The same gate covers seeded demo offers: `shared/demoOffers.ts:23` stamps `checkedAt` with `createdAt`, and the Reconfirm button is hidden when `provenance` is `demo`.

Actual result: the server rejects the unchanged confirmation with "This price is stale." The offer stays unusable, so its savings and any downgrade, annual, or migrate proposal stay blocked. After 30 days the demo catalogue drops out of suggestions and controlled tests the same way, with no refresh control.

Minimal fix: an explicit reconfirm sets `checkedAt` and `confirmedAt` to now for unchanged terms. Refresh demo catalogue timestamps in `migrateWorkspace` while the offer remains the labeled illustrative fixture.

### 3. Medium — cancellation leaves cost on its end date
`shared/domain.ts:18` and `shared/lifecycle.ts:38`

Trigger: a cancel-pending subscription whose end date is today, or a workspace load on that date. `recordOutcome` uses the same cutoff at `shared/lifecycle.ts:123`.

Actual result: `isCurrent` is false on the end date, so the subscription drops out of monthly cost that day. Loading the workspace stores it as `cancelled` because the check is `endDate <= asOf`. The agreed rule is that it leaves once the end date has passed. Excluding the renewal charge on that date is already correct in `billingInMonth`.

Minimal fix: treat the subscription as current when `endDate >= asOf`, and convert it to `cancelled` only when `endDate < asOf`. Record an end date of today as `cancel_pending`. Update the assertions in `tests/lifecycle.test.ts:49` that lock the early cutoff.

### 4. Medium — weekly and quarterly charges are stored as monthly
`server/imports.ts:422` and `src/ImportFlow.tsx:38`

Trigger: import two charges seven days apart, or about ninety days apart. Select the row and save.

Actual result: the reason says the pattern is unsupported and the row starts unchecked, but `cycle` falls through to `"monthly"`. The card shows "/ month". `candidateProblems` does not require a cycle decision, and confirm accepts the row. Folio then projects a monthly renewal.

Minimal fix: keep an unsupported pattern off the monthly cycle. Block save until the user explicitly chooses monthly or yearly and that choice is recorded in `reviewedFields`.

### 5. Medium — a corrected plan change previews the wrong reduction
`src/ChangePanel.tsx:213`

Trigger: record a plan that has already taken effect, then correct the price. Example: $20 becomes $10, then correct it to $5.

Actual result: the form computes the reduction from the subscription's current price and says "$5.00 / month". `recordOutcome` stores the reduction against the original terms, so the ledger and the recorded total show $15. The number the form promises is not the number that lands in Recorded reductions.

Minimal fix: preview the same baseline `recordOutcome` uses, the earliest matching outcome's `before` terms, so a correction shows the figure that will replace the previous one.
