**AGREED, with the wording corrections below.** These corrections are my only objections. None of them adds scope. Once C1–C4 are in the text, my objections are resolved. C5–C7 are recommended clarifications and do not block agreement.

The three positions I said I would hold are all in the agreement: correct actions (items 7–8), real personal follow-through (item 9), and CSV import that detects recurring charges (item 2). I accept the narrower framing in four places:
- Personal reductions are "user-recorded", not "realized".
- Failed runs get a fresh approval instead of being replayed.
- Weekly and quarterly charges are flagged as unsupported.
- We don't claim Google or Apple calendar import was tested unless it actually was.

None of these weakens the decision loop, and each one keeps the product honest.

## Corrections needed for agreement

**C1. Item 1: cancel-pending charges are ambiguous.** As written, "Cancel-pending counts cost until its end date" could be built so that a charge is projected on the end date itself.
- **Replace with:** "Cancel-pending stays in current cost until its end date. No renewal is projected on or after the end date. Once the end date passes, it leaves monthly cost and upcoming charges."
- **Add to acceptance:** "A cancel-pending subscription whose end date equals its next renewal shows no upcoming charge on that date."

**C2. Item 8: the test merchant must be independent in fact, not just in name.** My round-1 finding was that verification only confirms what Folio scripted (`server/browser.ts:37-41,65,83-98`). The current text implies independence but doesn't require it.
- **Add:** "Merchant state changes only through the hosted merchant pages' own handlers, authorized by a per-run merchant token. Neither the Folio action API nor the agent can write merchant state directly. Verification compares status, plan, price, cycle and effective date with the approved proposal."
- **Add to acceptance:** "A run that never completes the merchant UI flow cannot pass verification. An end-of-period change is stored as scheduled, not immediate."

**C3. Items 6 and 9: show recorded outcomes as their own number.** Recording a change is useful only if its effect can be seen somewhere. My round-1 acceptance was "realized savings shown separately".
- **Add to item 6:** "Show the potential-savings figure once. Show user-recorded monthly reductions as a separate, labeled total. Label demo-applied reductions as Demo."
- **Add to item 9's acceptance:** "A recorded personal cancellation appears in the recorded total. A sandbox test never does."

**C4. Items 4 and 5 contradict each other.** Item 4 lets every subscription get a "lower plan", "annual" or "alternative" verdict. Item 5 allows those only with a fresh, confirmed offer.
- **Add to item 4:** "Lower-plan, annual and alternative verdicts show dollar savings only from a fresh confirmed offer. Without one, they read 'price unconfirmed' and are left out of totals and proposals."

## Recommended clarifications (do not block agreement)

- **C5. Verification:** "Schema-validate the gateway's JSON for receipts, research, confirmation text and agent steps. Invalid output fails visibly and writes nothing." This covers the hypothesis that `server/agent.ts:34-42` (`jsonAgent`) is fragile. Items 3, 5, 8 and 9 all depend on that output.
- **C6. Item 2:** "Count non-USD rows by currency in the skipped reasons." Multi-currency is excluded, so these rows must at least be counted.
- **C7. Items 6 and 10:**
  - Store calendar tokens hashed, and make tokens and recovery codes at least 128 bits of randomness.
  - The calendar file contains only name, amount and date. It has no evidence or notes, leaves out cancelled subscriptions, and is served with `no-store`.

## Coherence check

- **Order of work:** item 1 comes first. Items 2–4 build on it, then 5, 7 → 8 → 9, and then 6. Item 10 can run in parallel, and item 11 comes last. The text has no circular dependencies.
- **Exclusions:** I agree with all of them. They are bounded by missing credentials, and the reasons are honest.
- **Unsafe or untruthful behavior:** none remains once C2 and C3 are in. Personal sandbox runs stay tests, and the demo ledger only changes on an explicit apply step.
