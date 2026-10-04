**AGREED**, subject to the acceptance locks below. Adopting them resolves my objections. I am not adding deliverables, and I am not asking to cut or defer anything already in items 1–11.

The commitment matches the decision loop from both round-1 reviews: discover, cite evidence, decide, approve an exact controlled test, and record a personal outcome only when the user attests to it. I accept the reconciliations as written. User-recorded and projected monthly reductions replace a bank-realized savings ledger. Weekly and quarterly patterns are flagged as unsupported. Failed runs get a fresh approval. The ICS feed is proven with fixtures, and a Google or Apple import is claimed only if it is actually tested. Items 1–11 all ship. The exclusion list stays excluded.

One attribution note, so a later edit does not invert the safety rule. In `docs/reviews/grok-round-1.md`, sandbox verification and the personal ledger are separate acts. The second confirm that writes a sandbox success onto the subscription is `docs/reviews/opus-round-1.md` item 4. The normative text already has the safe split: demo-only apply, personal changes only by user attestation. Keep that split.

## Required corrections

These are acceptance locks on items already in the roadmap.

1. **Item 1.** Rolling the billing anchor forward changes only the forecast next-renewal date. A charge-history row is created only from an import or an explicit user record. Cancelled subscriptions stay out of upcoming charges. Cancel-pending still counts until its end date.

2. **Item 4.** With no usage evidence, or with only partial browser evidence, the verdict is "needs evidence" and the savings amount is empty. A current check-in that the user would renew, or that the value is shared, background, or not usage-shaped, is evidence the selector can cite, and while it is the deciding record the verdict is "keep". "Review cancellation", "lower plan", "annual", and "alternative" require a deciding source that supports that label. The last three also require a fresh confirmed target from item 5. Deleting or replacing the deciding record recomputes the verdict from what remains.

3. **Items 1, 5, and 6.** Personal savings dollars are user-confirmed offer deltas and user-recorded reductions. In a demo workspace, illustrative deltas may appear with an illustrative label, and only when the target is cheaper and otherwise valid. Unconfirmed model extracts add no dollars. Dismissed items stay out of the total and out of the renewal queue. The overview shows that savings figure in one place.

4. **Item 2.** Every skipped row reports a reason. Unrecognized currency, including non-USD, is one of those reasons, and those rows are not imported as USD.

5. **Item 6.** The keep decision is stored with the billing cycle it covers. The workspace stores the last-opened time used by the since-last-visit summary.

6. **Items 7, 8, and 9.** The controlled merchant stores the approved target, price, cycle, and effective date. For cancel and downgrade, success means cancel-pending through that approved end date. An immediate status that differs from the approved effective date fails the run. Apply-to-ledger is offered only in a Demo workspace and updates only that demo subscription. Personal workspaces record outcomes only through item 9. Confirmation text and model output are editable suggestions, and a sandbox receipt cannot create a personal savings figure. Screenshots stored as artifacts are controlled-merchant artifacts. Personal inspection stores only the evidence fields the user saves.

7. **Item 7.** Migration is offered for a controlled fixture that has an export set, or when the user records that they have data to move. Merchant name and category do not imply portable data.

8. **Item 8.** The bar remains eight runs, four action kinds by two variants. At least one variant uses different visible labels or a decoy, so a path hardcoded to the other variant cannot reach the approved state. Success remains the independent server-side match.

9. **Item 11.** The sidebar and the workspace control show the active mode, Demo or Personal. At 390px the assistant does not cover cost, renewal, usage, or primary actions.

With those nine sentences in the agreement, I have no further objection. Neon, the AI Gateway, Kernel, and Exa are sufficient for this scope. Gmail, a bank connector, identity-provider login, email or push, and real-merchant writes remain blocked on credentials and on the stated product limit.
