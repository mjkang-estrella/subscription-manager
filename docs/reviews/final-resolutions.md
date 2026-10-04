# Final review resolutions

Both reviewers agreed to the eleven-item roadmap before implementation. Their independent final code reviews are preserved in `opus-final.md` and `grok-final.md`.

## Opus

1. **Long receipt backup — fixed.** Evidence backup validation now accepts the same 4,000-character bound as merged import excerpts. A multi-receipt import/export/restore regression retains the complete excerpt.
2. **Aged Demo offers — fixed.** Workspace migration refreshes only illustrative Demo offers. Personal offers remain untouched. Unexpired awaiting approvals and running actions lock offer fingerprints; expired proposals are expired before refresh. Regression covers all three states.

## Grok

1. **Active-use migration suggestion — fixed.** Migration and downgrade suggestions require underuse; active use can yield a valid annual offer or Keep. Explicit controlled tests remain available from the Change tab. Tests cover Notion, iCloud and GitHub.
2. **Reconfirm rejected — fixed.** The existing attested form explicitly requests reconfirmation. Stale unchanged terms receive current timestamps and user provenance, preserving the distinction from freshly researched prices. Silent stale confirmation still fails.
3. **End-date cutoff — fixed.** Current cost includes the stated end date; the next day transitions to cancelled. Renewal charges on or after the end date remain excluded.
4. **Unsupported cadence — fixed.** Unconfirmed cycles display as unconfirmed and require an explicit monthly/yearly choice. Both candidate review and the server reject saving without the recorded decision. Weekly and quarterly fixtures cover the boundary.
5. **Correction preview — fixed.** The form uses the original outcome baseline, matching the cumulative recorded reduction, including signed corrections. The $20 → $10 → $5 regression records $15.

## Live verification fixes

- Vercel's loader could not require the mail parser's ESM-only decoder. The dependency override uses its compatible decoder and Node 24 is pinned; hosted API and receipt extraction pass.
- Unsupported researched prices are discarded. A bounded second attempt can save a source-only comparison with zero offers and an explicit unverified-price notice; it cannot salvage ungrounded prices.
- PostgreSQL JSONB reorders object keys. Migration compares ordered document IDs, titles and complete bodies rather than serialized property order. All eight hosted-handler variants also pass against Neon, including altered-document rejection.

No reviewer finding was deferred. Final live results are recorded in `../release-verification.md`.
