Assessment B agrees Folio should ship one decision loop: identify the subscription, judge it from cited evidence, approve an exact sandbox change, and record the outcome in the ledger. The live app already does the tour. It does not yet close that loop for a person’s own subscriptions.

Live check on tab `tab_9` at https://folio-subscription-manager.vercel.app, plus source at `82fb2c7`. No writes, no Kernel run, no Exa call. Production reports Neon Postgres, Neon AI Gateway, Kernel, and Exa configured. Gmail is not.

## What already holds

The demo ledger is honest about its two totals: average monthly cost **$135.45** (GitHub $48/year shown as $4) and scheduled this month **$179.45**. The composition donut, local logos, dismiss/restore, and “missing evidence is not unused” behavior are in place. Sandbox copy on the approval dialog says the real ledger stays unchanged. Browser-only inactivity cannot produce a cancel (`shared/domain.ts` lines 38–52 and 64–70; tests lock this in). A non-demo downgrade contributes **$0** until a price exists (`shared/domain.ts` lines 86–99).

## Observed issues

**Recommendations are a two-rule demo.** `recommendations()` emits only cancel at usage `0`, or downgrade under 15% of a limit. Annual switch and migration are never suggested. Downgrade dollars exist only for `source === "Demo"`, using a fictional $9 Starter. Live Savings shows that split: Adobe **$59.99** and YouTube **$13.99** to cancel, Figma **$6.00** with the caveat “Illustrative test plan: $9/month.” Spotify, Notion, iCloud+, GitHub, and Netflix get no verdict at all, so “actively used” is silence rather than a judgment. YouTube’s seed treats “no premium activity” as unused, which ignores the value of an ad-free plan that has no session count.

**The cited evidence can be the wrong row.** Savings prints `s.evidence.at(-1)` (`src/App.tsx` lines 907–915). The rule uses the latest non-receipt, non-browser record. A later receipt would be what the card claims to have used.

**Browser activity is painted as a healthy result.** Any visit count above zero is a green “Browser activity” badge (`shared/domain.ts` lines 43–47). The same signal is correctly barred from cancel recommendations. The table and the savings rules disagree.

**Import does not produce a book you can judge.** CSV candidates are forced to category `Lifestyle`, plan `Subscription`, and usually an empty domain (`server/imports.ts` lines 129–150). The review form edits name, amount, cycle, and date only (`src/App.tsx` lines 1628–1698). Non-USD rows are dropped with no count. Browser import then matches `v.domain === s.domain` exactly (`server/app.ts` line 275), so those rows never receive usage. Help still says “connect Gmail” (`src/App.tsx` lines 1152–1154) while live Gmail status is “Import receipts or configure OAuth.”

**A verified sandbox run never meets the ledger.** Prepare hardcodes Starter $9, annual at 20% off, and a $5 replacement (`server/app.ts` lines 378–393). Completion writes the action receipt only (`server/browser.ts` lines 99–107). The approval dialog states spending totals stay unchanged (`src/App.tsx` lines 1211–1214). After a successful Adobe cancel, the dashboard would still show $59.99 and the same opportunity. There is no “I made this change” record either. The next-payment column shows the stored date (`src/App.tsx` line 673), while the calendar projects later months (`shared/domain.ts` lines 14–21), so the list goes stale after the billing day. New demo workspaces also clamp every seed billing day up to today (`shared/domain.ts` line 253). That is not visible on 4 Oct; Spotify correctly shows Oct 9.

**Inspection save is not durable on Vercel.** The Kernel session is in Neon. The captured draft lives in a process-local `Map` (`server/app.ts` lines 293–324). A second instance will reject Save. Interrupted runs are marked failed after 15 minutes (`server/store.ts` lines 82–99) and there is no retry. The live view URL is removed when the function finishes (`server/browser.ts` lines 141–147).

**The workspace is a cookie with a partial exit.** Export is a subscription CSV without evidence, actions, or dismissals. There is no erase-workspace action. The sidebar control always says “Personal workspace” (`src/App.tsx` line 342) while the pill correctly says “Demo workspace.” “Connect account” opens integration status, not a bank or mailbox. Category chips are only All, Entertainment, and Productivity (`src/App.tsx` lines 572–600), so Design — 44% of the demo — cannot be filtered. The cost header always shows a down arrow while the default sort is renewal.

**Mobile savings is usable and partly blocked.** At 390px, `scrollWidth` was 375, so the page does not overflow sideways. The Ask Folio button covers the Figma card’s evidence and price.

Impeccable `detect --json src` returned `[]`. Context reported an incumbent UI and no `PRODUCT.md`. That empty detector result does not mean the decision loop is finished. Prior contrast, focus, donut, and dismissal work should stay as it is.

## Hypotheses

These follow from the code. I did not spend a Kernel or Exa call to watch them.

- A user who opens Watch browser session late in a run may find the link already gone.
- Capture-then-save on the public deployment can fail even though the browser session still exists.
- `jsonAgent` accepts only a single JSON object after a fence strip (`server/agent.ts` lines 34–42). A prose or double-encoded gateway reply fails the whole import or browser step.
- The in-memory 40-request limit (`server/app.ts` lines 71–84) does not hold across function instances.

## Release to implement

Six deliverables, one ledger. Preserve the light green brand, bundled logos, donut, concise copy, and dismiss/restore.

**1. Personal import and a true first book.** Depends on nothing. Normalize merchant strings to a domain, category, and logo for common statement names. Infer monthly versus yearly from charge gaps, and say when a single charge is only a candidate. Review edits domain, category, and plan before save. Tell the user how many non-USD rows were skipped and if the candidate list was truncated. After “Start with my subscriptions,” the empty overview’s next step is import or add, then one usage fact on the largest charge. The sidebar label matches Demo or Personal. The header action says Connections. Help describes CSV and pasted receipts. Gmail stays a disabled path.

Acceptance: a messy USD sample CSV becomes distinct subscriptions with domains and logos; a coffee one-off can be removed before save; an empty-domain row can gain `spotify.com` in review and then match a browser-activity file; EUR rows are counted, not silently merged.

**2. Evidence that can carry a verdict.** Depends on 1 for domains. Keep every evidence row. Choose the deciding row explicitly and show its source, date, and confidence. Split “days used” from “quota consumed,” and ask for quota only when the plan has one. Browser visits stay a partial, non-green signal and still cannot cancel or downgrade alone. Stale evidence (older than 60 days) stays visible as “refresh before acting” and drops out of the savings total. Store the inspection draft in `folio_server_sessions`, the same place as the browser session.

Acceptance: a receipt added after account evidence does not change the source named on the savings card. A browser import never turns the badge green “Actively used.” A stale zero-usage row remains on the subscription and is absent from the dollar total. Capture then save succeeds when the draft is read back from Neon rather than process memory.

**3. A verdict for every active subscription, with cited dollars.** Depends on 2. Each active subscription gets one current judgment: keep, needs evidence, reconsider cancel, lighter plan, annual, or switch. The savings total includes only positive amounts the user confirmed or that Exa quoted with a source link. Demo fixtures may keep labeled illustrative prices, excluded once the workspace is personal. Annual appears only for a monthly plan when a lower annual price is confirmed. A lighter plan appears only with the cheaper plan’s price and what is lost. A switch appears only with sources and the capability gap. Known overlaps are relationship facts, not invented prices: YouTube Premium already includes YouTube Music; Adobe All Apps is not the same product as a single app. Research is saved on the subscription with `checkedAt`. Exa runs when the user asks, not on every page view. Dismissed ids stay out of the total and out of the assistant.

Acceptance: on the demo, Adobe and YouTube remain cancel candidates, Spotify and iCloud+ say why they are kept, and Figma’s $6 is visibly illustrative. On a personal subscription, an unsourced downgrade shows no dollar savings and does not prepare a $9 plan. A confirmed annual price is the only way an annual recommendation enters the total.

**4. Exact sandbox action, then an explicit ledger update.** Depends on 3 for the target price. The proposal shows current plan, target plan, both prices, cycle, effective date, and consequence. Personal proposals refuse an invented target. The Kernel runner stays on the isolated merchant fixture and verifies plan, price, cycle, and status against the approved spec. Migration still requires the exported and imported sample set to match. One decoy-label fixture in tests proves the agent is following visible controls rather than one hardcoded script. The user can retry one failed or expired run under the same approval while the subscription still matches the proposal. On success, a second confirm — “Record this outcome in Folio” — updates status, plan, price, cycle, and next date, and supersedes other open proposals for that subscription. The same form is available without Kernel for a change the person made themselves. Sandbox execution still never touches a real merchant.

Acceptance: a demo cancel can be verified, and only the record step removes it from active cost, the calendar, and savings. Closing the progress dialog without that step leaves the subscription unchanged. A personal downgrade without a confirmed price cannot be approved. A second fixture with different button labels still reaches the approved state.

**5. Ownership without an account system.** Parallel with 1. Export and import the whole workspace JSON: subscriptions, evidence, actions, dismissals, mode. Delete workspace removes the Neon row and clears the cookie. A short data note states that this browser’s cookie is the key, Neon holds the record, and there is no login. CSV export stays for spreadsheets.

Acceptance: export, load in a browser without the cookie, import, and the same subscriptions and dismissed opportunities return. Delete makes the next visit a new demo workspace. Secrets and Gmail tokens are not inside the file.

**6. A reason to open Folio before the renewal.** Depends on 1 and 4 so dates and cancelled status are real. On open, show charges due within 7 days, the single largest subscription that still needs evidence, and any verdict whose evidence has aged out of the dollar total. Remember the last open time on the workspace and show completed records and new charges since then. Price checks stay on the button from 3.

Acceptance: with the demo dates, Spotify’s Oct 9 charge is called out from Overview. A cancelled recorded subscription disappears from that list. Nothing is emailed and Exa is not called just because the page loaded.

## Defer, with reasons

- **Gmail OAuth.** Live status is unconfigured, and no Google client id, secret, or redirect was supplied. Pasted receipts and `.eml` cover discovery.
- **Real merchant writes.** The product constraint is exact-change approval on controlled test accounts. Kernel is configured; using it against Netflix, Adobe, or a bank is out of this release.
- **Login, recovery, and multi-device sync.** No identity provider is configured. The JSON export is the recovery path that can ship today.
- **A durable job queue and automatic replay.** Vercel `waitUntil` is 300 seconds. The action row plus one explicit retry fits that limit. A worker and a retry policy would be a second system.
- **Bank connect, mail digests, and background price crawls.** No bank connector, no mail transport, and unattended Exa spend is not justified.
- **Multi-currency books, dark mode, chat that executes actions, an extension rewrite, and full MIME parsing.** Non-USD rows should be counted in import. The rest does not make the decision loop true.

I did not run a paid browser action or research call, and I did not change the demo workspace. This is round 1. I will accept or object item by item when the other assessment and the proposed agreement are back.
