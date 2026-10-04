# Assessment A: Folio design and product review (round 1)

**Verdict:** Folio looks polished and is honest about uncertainty. The biggest gap is what happens after a decision. Every action ends in a sandbox page that Folio built itself, and none of it touches the user's real records. CSV import, the main way to get started, will break on most real bank exports.

## How I reviewed it

- **Code:** I read the README and the source under shared, server, src, extension and api.
- **Live site:** I used my own preview tab (`tab_a`). Screenshot capture timed out every time, so I used text snapshots, DOM measurements and `docs/dashboard.png` for visual judgment.
- **Changes made:** I created one downgrade proposal in my own demo workspace (iCloud+) and never approved it. No Kernel or Exa runs, and no real accounts.
- **Detector:** not run, as you asked.

## Design specificity

**Mostly interchangeable.** The layout is a stock SaaS dashboard: four number cards, a chart, a table and a "coming up" list. The green palette, leaf mark, real logos and the donut give it a calm, trustworthy look, and those choices should stay.

The parts that feel specific to Folio are:
- the "What we know" evidence list with confidence levels;
- the "missing data never means unused" principle;
- the before-and-after comparison on proposed changes.

**Missed opportunity:** the real job here is deciding before each renewal. Nothing on the Overview says "Adobe renews in 12 days, $59.99, no activity in 30 days: keep or cancel?" Instead, one savings estimate appears four times: a number card, an annual spotlight card, the sidebar badge and two "Review 3 opportunities" links.

## Nielsen heuristics

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Action progress is visible. But proposals you back out of stay forever, and connection badges show configuration, not health. |
| 2 | Match with the real world | 2 | Usage is "Amount used / Plan allowance" with no units. A "downgrade" can raise the price. "Test plan" wording is used even for real subscriptions. |
| 3 | User control and freedom | 2 | You can't mark a subscription cancelled, discard a proposal, undo an import, edit a captured draft or delete evidence. |
| 4 | Consistency and standards | 3 | The sidebar says "Personal workspace" while in demo mode. Only 3 of 6 category tabs are shown. |
| 5 | Error prevention | 2 | CSV rows are dropped silently. Annual switch is offered on annual plans. Duplicate checks need an exact match. |
| 6 | Recognition rather than recall | 3 | Import requires knowing the expected column names and date format. |
| 7 | Flexibility and efficiency | 2 | No column mapping, bulk review or "select likely only". |
| 8 | Aesthetic and minimalist design | 3 | Calm overall. The savings figure is repeated, and the phone layout is long and heavy. |
| 9 | Error recovery | 2 | Generic messages like "Some fields are invalid" or "No valid USD charges found" give no row-level reason. A failed action has no retry path. |
| 10 | Help and documentation | 2 | Help is short, but there is no guidance for exports from specific banks. The extension needs developer-mode install. |
| | **Total** | **24/40** | Acceptable, but needs real work. |

## Cognitive load and getting started

- **Making it yours is hidden.** The demo data looks finished. The way to switch to your own data is a dropdown called "Personal workspace" that opens a "Make it yours" dialog.
- **"Connect account" sets the wrong expectation.** The main button lists back-end services (Neon, Gateway, Kernel, Exa marked "Configured"). A user expects to connect a bank or email.
- **The import dialog mixes two jobs.** It adds subscriptions (CSV, receipts) and also adds usage evidence (browser activity).
- **The Actions tab offers the same four options for every subscription,** whether or not they make sense.
- **Phone layout:** the page is 3,147 px long, and the subscription list starts after about 1,400 px of number cards and donut. The table is 650 px wide inside a 352 px space, so the usage column is off-screen.

## Emotional journey

- **Start:** reassuring but impersonal. It is someone else's data.
- **Peak:** the live Kernel browser view. But an attentive user will notice that the "merchant" is a page Folio generated, with the expected result already built in. That makes it feel staged.
- **End:** "Test change verified", while the real subscription, the totals and the next charge are all unchanged. By the peak-end rule, that is a weak ending.
- **What should be the ending:** "You avoided a $59.99 charge on Oct 16", tracked as a realized saving.

## Strengths

1. The trust stance: evidence confidence, "unknown is not unused", browser history kept local, an explicit exact-change approval screen, and a check that the subscription hasn't changed since the proposal (`server/app.ts:439-446`).
2. Visual identity worth keeping: the green brand, real logos and the composition donut.
3. A sound backbone: concurrency-safe Neon storage, validation, failures recorded honestly, and recovery of stuck runs (`server/store.ts:82-101`).

## Observed issues

### Getting data in
- **Dates:** only `YYYY-MM-DD` is accepted (`server/imports.ts:112`). Rows in other formats are silently skipped.
- **Missing date column:** a column named "Transaction Date" isn't recognised, so every row falls back to today (`:106`). Each merchant then looks like a one-off charge.
- **No recurrence detection:** every merchant with a non-zero amount becomes a candidate, groceries included. The list is cut to the first 100 by file order (`:129`).
- **No merchant-name cleanup:** grouping uses the exact lowercase descriptor (`:115`), so "NETFLIX.COM 866-…" variants split apart.
- **Refunds count as charges:** amounts are made positive with `Math.abs` (`:103`).
- **Every candidate gets category "Lifestyle" and no website** (`:145`). That breaks logos, account inspection and matching browser activity.
- **Review is limited:** you can only edit name, amount, cycle and date (`src/App.tsx:1628-1698`). Duplicates are only caught on an exact name, price and cycle match (`server/app.ts:209-217`).

### Recommendation quality
- **Only two rules:** a cancel suggestion when usage is 0, and a downgrade when usage is under 15% of the allowance (`shared/domain.ts:71,86`). Usage has no units (the demo Netflix entry is "12 titles of 30"). Only the latest piece of evidence counts.
- **Missing signals:** no cost per use, no overlap between similar services, no price-increase detection, and no annual-switch suggestions.
- **Downgrade savings for real subscriptions are always 0** (`:93`).
- **The savings card can show the wrong evidence.** It shows the latest evidence, which may not be what produced the suggestion (`src/App.tsx:910`).
- **Alternatives research disappears** when the drawer closes (`src/App.tsx:1883`) and never feeds into a proposal.

### Action correctness (confirmed live)
- **Downgrade is hard-coded to "Starter $9"** (`server/app.ts:382`). In the live app, iCloud+ at $2.99/month got a "downgrade" to $9.00/month.
- **Annual switch is offered on annual plans** and assumes a 20% discount (`:383-388`). GitHub Pro at $48/year would become $38.40.
- **Migration always means "Replacement workspace $5" with 3 sample documents** (`:389-393`), even for Netflix or Spotify.
- **Every action takes effect today** (`:406`), including cancellations.
- **"Keep as is" leaves the proposal waiting for approval forever** (`src/App.tsx:1261`). I confirmed the workspace still held the proposal and the bell dot stayed on.

### Follow-through
- **The "cancelled" status can never be reached.** The edit form doesn't include status (`server/imports.ts:15-32`), and no code ever sets it.
- **Payment dates never move forward.** Nothing advances `nextBilling` after it passes.
- **"Coming up next" includes charges already past this month,** shown as "0 days away" (`src/App.tsx:738-753`).

### How verification works
The test page is built with the target state already inside it and loaded with `setContent` (`server/browser.ts:37-41,65`). Verification then reads that same page's variables (`:83-98`). So it can only confirm what Folio itself scripted.

### Trust and data ownership
- **Captured account evidence is held in server memory** (`server/app.ts:293-325`), not in Neon.
- **No recovery, full export or delete.** Export covers subscriptions only; evidence, actions and research are not included.
- **Account inspection opens the merchant homepage** (`server/inspection.ts:39`). There is no notice that you are signing in inside a third-party cloud browser.

### Other
- The chat sends only the last message (`src/AgentChat.tsx:20-26`).
- The category tabs are hard-coded (`src/App.tsx:573-599`).
- The "M" avatars are hard-coded.

## Hypotheses (not verified)

- On Vercel, the "capture" and "save" requests for account evidence could hit different server instances, so saving fails with "Capture account evidence before saving."
- The 40-requests-per-minute limit is per instance, so it is not enforced reliably.
- Month calculations mix local time and UTC (`App.tsx:203-206`), which could show the wrong month near midnight on the 1st for users ahead of UTC.
- On phones, the "Ask Folio" button probably covers the last table rows.
- Before relying on structured output, check that the gateway model returns schema-valid JSON reliably.

## Roadmap

The items run in dependency order. All are executable with Neon, the Gateway, Kernel and Exa.

**1. Data model and lifecycle (foundation)**
- Add charge history per subscription.
- Add statuses: active, cancel pending (with end date), cancelled.
- Add a per-renewal decision: keep, review or cancel.
- Give usage evidence a unit and a metric type.
- Store research results.
- Add a realized-savings ledger.
- Add a schema version, migrated when a workspace loads.
- Move the account-evidence draft into Neon sessions.

Acceptance:
- Old workspaces migrate when loaded.
- Past payment dates move forward by cycle and are marked "confirm this charge".
- Past charges don't appear in "Coming up next".
- Unit tests cover all of this.

**2. CSV import that works on real statements** (depends on 1)
- Detect columns automatically, with manual mapping as a fallback.
- Handle date formats, including ambiguous M/D versus D/M; separate debit and credit columns; and the sign of credits.
- Clean merchant names (strip store and phone numbers, PAYPAL *, SQ *, APPLE.COM/BILL).
- Detect billing cadence: weekly, monthly, quarterly or annual, within a tolerance.
- Use a known-merchant catalog covering website, category, logo, usage-page URL and official manage/cancel URL.
- For unknown merchants, send only the cleaned merchant names to the gateway.
- Review screen:
  - group results into Likely (pre-selected) and Possible (unselected);
  - show each candidate's charge list;
  - allow editing category and website;
  - merge near-duplicates into existing subscriptions and attach their charges.

Acceptance:
- Synthetic Chase, Amex, Capital One and generic exports produce the expected lists.
- One-off charges never appear under Likely.
- Every run reports a full row count, for example: rows read, charges, likely, possible and skipped, with a reason for each skip.
- No silent cut-off at 100.

**3. Receipt import hardening**
- Parse `.eml` files properly, including multipart, quoted-printable and HTML.
- Accept several files at once.
- Show each extracted field next to the source text it came from.
- Skip candidates that match subscriptions already found through CSV.
- Gmail stays blocked by missing credentials; keep the current fallback.

**4. "Is it worth it?" evaluation** (depends on 1 and 2)
- Per-merchant usage metrics come from the catalog.
- Show cost per active day or use.
- A three-tap check-in: "Would you re-subscribe at $X?" and "Who uses it?"
- Flag overlapping services, such as several video streamers or duplicate storage.
- Detect price increases from charge history.
- The rules decide the verdict; the gateway only writes the explanation.
- Browser activity can mark something "worth reviewing" but can never trigger a cancel suggestion.

Acceptance:
- Every suggestion has a "Why" section: the evidence used, the rule, and what would change the verdict.
- No suggestion without evidence or a check-in.
- Unit tests cover the rules.

**5. Verified pricing and alternatives** (Exa plus gateway)
- Save structured plans with name, price, cycle, source URL, quote and check date.
- Save alternatives with what you would lose and how hard moving is.
- Accept a price only if it appears verbatim in the fetched source text.
- Mark results older than 30 days as stale.

Acceptance:
- No price is shown without a source link.
- Downgrade and annual proposals use verified prices, or clearly say "illustrative sandbox price".

**6. "Renewals to decide" on the Overview** (depends on 4)
- Replace the duplicated savings spotlight with a queue ordered by renewal date and money at risk.
- Each row offers Keep (hidden until the next cycle), Change plan, and Cancel.
- Keep the donut and the number cards.

Acceptance:
- The savings estimate appears once, labelled as potential.
- Realized savings are shown separately.

**7. Reliable actions against independent controlled test merchants** (depends on 1 and 5)
- **Only offer actions that make sense:**
  - no downgrade that costs more;
  - no annual switch on an annual plan;
  - migration only for services that hold data.
- **Effective dates:** cancellations and downgrades take effect at the end of the current period.
- **Proposal lifecycle:** proposals can be discarded and expire after 24 hours. Failed actions can be re-prepared. Only one action can run per subscription at a time.
- **Independent test merchants:** Folio hosts the test merchant pages with state stored in Neon. The browser navigates to them like a real site.
- **Several flow types:** a retention offer, a confirm dialog, a plan-picker grid, a nested settings menu, a decoy button and an annual toggle.
- **How the agent works:** it reads the page's accessibility tree and picks from a fixed set of allowed moves. If the price or plan on the page differs from what was approved, it stops and asks the user.
- **Verification:** completion is checked by reading the merchant's state on the server, not the page. A Kernel screenshot is kept as an artifact.

Acceptance:
- Each action type passes against at least two flow types in one paid verification run.
- Nothing is marked complete unless the server-side state matches.

**8. Real-world follow-through without the agent writing to real accounts** (depends on 1 and 2)
- For a real subscription, "Cancel" builds a plan: the official manage URL (from the catalog, or from Exa limited to the merchant's official site), a deadline (the day before renewal), and short steps.
- The user does it themselves in their own browser.
- They then mark it cancelled and can paste the confirmation email; the gateway pulls out the end date. Status becomes "cancel pending" and then "cancelled".
- The saving is recorded in the ledger.
- A later CSV import flags any charge after the end date.

Acceptance:
- Status changes are tested.
- Totals drop the subscription after its end date.

**9. Ongoing value without new credentials**
- A private calendar feed (ICS) with renewal and trial reminders, using a revocable tokenized URL.
- A "since your last visit" summary: renewals that passed, price changes, stale evidence.
- Optionally, a daily Vercel cron to clean up stuck runs and move dates forward.

Acceptance:
- The ICS file validates and imports into Google and Apple calendars.

**10. Trust and data ownership**
- A recovery code shown once, stored hashed, with restore on another device and rotation.
- Full JSON export and import.
- Delete workspace.
- A "What leaves Folio" page: what goes to the gateway, Exa and Kernel.
- A notice about signing in inside a cloud browser before account inspection starts.
- The captured account-evidence draft can be edited before saving.

**11. Information architecture and phone layout**
- "Connect account" becomes "Add data sources" (CSV, receipts, extension, and Gmail marked unavailable). Back-end service status moves to Help.
- Split the import dialog: adding subscriptions stays in the dialog; adding usage evidence moves into the subscription details.
- Show category filters for categories that actually exist in the data.
- Fix the mode labels and the hard-coded avatars.
- On phones, show subscriptions as cards and use a compact donut legend.

Acceptance:
- No horizontal scroll at 390 px.
- The first subscription appears within two screen heights on a phone.
- Keyboard paths are re-checked.

**12. Chat**
- Send the whole conversation, ground answers in the new data, and add deep links into the app.
- Small effort, so do it last.

**If time runs short,** this is the cut line that still makes a strong release:
- items 1, 2, 4, 6, 8 and 10;
- item 7 with three flow types;
- item 9's calendar feed and date roll-forward;
- item 11's phone layout;
- item 5 limited to official prices for downgrade and annual.

## What to defer, and why

- **Bank connection** (Plaid, MX, Teller): no credentials, plus compliance work. CSV covers the need.
- **Live Gmail:** needs Google client credentials. Production use of the `gmail.readonly` scope also needs Google's restricted-scope verification.
- **Email or push reminders:** no email or push provider credentials. The calendar feed covers reminders for now.
- **Agent actions on real merchant accounts:** outside the agreed scope, with terms-of-service and credential-custody risk.
- **Durable job queue:** needs an extra provider. Resumable step records in Neon plus a cron sweep cover it for now.
- **Multi-currency:** defer, but report skipped non-USD rows instead of dropping them silently.
- **Passkeys or email login:** passkeys are feasible but not essential today; email login needs an email provider.
- **Publishing the extension:** needs a Chrome Web Store developer account.

**Other unknowns to confirm:** Kernel concurrency and cost limits, how often Vercel cron can run on your plan, and the gateway model's structured-output reliability.

**Positions I'll hold in round 2:**
- Fix action correctness (item 7).
- Ship real follow-through and the realized-savings ledger (item 8).
- Make CSV import detect recurring charges (item 2).

I would object to an agreement that adds features without those three.
