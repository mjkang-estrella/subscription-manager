# Verification

Verified on October 4, 2026.

- `npm test`: 12 passing tests for billing calculations, month-end dates, evidence semantics, chronological imports, validation, and fixture escaping.
- `npm run test:integration`: passed creation/edit/removal, persistence, workspace isolation, CSV review and duplicate prevention, validation, and cross-origin request protection.
- `npm run build`: TypeScript checking and production build passed.
- Live Neon Postgres: isolated workspaces persisted and were read back.
- Live Neon AI Gateway: model catalog, Mastra analysis, Assistant UI conversation, and structured receipt extraction succeeded.
- Live Exa: five alternative/pricing sources were returned and summarized.
- Live Kernel: cancellation, downgrade, annual-billing change, and migration completed in isolated merchant fixture pages. Final plan/amount/cycle/status matched each approved proposal. Migration compared the contents of three exported/imported sample documents.
- Browser UI: manual subscription entry, persistence after reload, search, removal, monthly calendar, assistant conversation, and approval-to-verification flow exercised.
- Mobile: 390px Chromium viewport had no page-level horizontal overflow; payment calendar switched to a compact list. Enlarged 200% text retained bounded filter/search controls. Physical touch and screen-reader testing were not performed.
- Impeccable audit: ten grouped findings fixed; final detector returned zero findings. Automated axe checks found no violations on the tested screens. See `docs/impeccable-audit.md` for scope and limits.
- Browser activity import preserved its original observation date; old data was not relabeled as fresh.
- Private preview access gate kept the shared test preview behind a session token. No credentials or private account data appear in screenshots.

Gmail OAuth was not exercised because Google OAuth app credentials were not supplied. No real merchant cancellation or migration was performed. Real account authentication remains a user action in the isolated browser; all tested execution used synthetic accounts and records.

UI update: replaced the monthly bar projection with a composition donut, sorted by monthly equivalent cost. Verified the $135.45 sample total, GitHub annual normalization ($48/year to $4/month), 44px legend controls, opening subscription details, and 390px/1440px layouts. The chart panel had no automated axe violations; TypeScript and the production build passed.

Annotation updates: removed sidebar promotional content and redundant interface copy. Dismissal persists per workspace, excludes opportunities from savings totals and assistant suggestions, and supports restoration. Integration checks cover persistence, workspace isolation, idempotence, invalid inputs, and restore. Browser flow verified dismissal across reload and restoration ($79.98 to $19.99 and back); subscription cost stayed $135.45.

Brand assets: all eight service logos are bundled from official sites and their referenced CDNs; provenance is recorded in `public/logos/sources.json`. Verified all 20 rendered logo instances loaded successfully, the 390px layout had no page overflow, and the production build passed. Unknown services keep a neutral initial; no runtime third-party logo request is made.
