# Impeccable audit and remediation

Audited October 4, 2026 with Impeccable 4.5.0, its deterministic detector, axe-core 4.13.0, source inspection, and the T3 Chromium preview. The user requested both the audit and fixes. Existing Folio visual identity was preserved.

## Verdict

**Pass for the audited scope.** Folio retains a coherent subscription-management interface: payment projections distinguish annual renewal charges from monthly equivalents, recommendations show their evidence, and proposed changes have explicit approval and verification states. Both verified detector findings were resolved; the final detector result was `[]`.

| Dimension                |    Before |     After | Evidence and limits                                                                                                         |
| ------------------------ | --------: | --------: | --------------------------------------------------------------------------------------------------------------------------- |
| Accessibility            |       2/4 |       3/4 | Contrast and ARIA violations resolved; keyboard dialogs checked. Automated checks do not certify full WCAG compliance.      |
| Performance              |       3/4 |       3/4 | Removed layout animation and remote font dependency; assistant remains a lazy chunk. No real-user performance measurements. |
| Responsive design        |       2/4 |       3/4 | Larger targets, mobile navigation, 200% text, and bounded table controls. Physical touch devices not tested.                |
| Theming                  |       1/4 |       3/4 | Semantic color tokens and an explicit light color scheme. Dark mode is outside the current product scope.                   |
| Implementation integrity |       3/4 |       4/4 | Zero final detector findings, consistent controls, honest demo and evidence labels.                                         |
| **Total**                | **11/20** | **16/20** | **Acceptable → Good**                                                                                                       |

Scores are reviewer assessments against the skill's rubric, not automated certification.

## Findings and fixes

Ten grouped findings: **0 P0, 4 P1, 6 P2, 0 P3**. All confirmed findings below were fixed.

| Severity | Location                            | Issue and user impact                                                                                                                                       | Implemented fix                                                                                                                                       |
| -------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1       | `src/styles.css`                    | Low-contrast secondary text made costs and supporting information difficult to read; WCAG 1.4.3. Overview alone had 98 failing elements.                    | Replaced scattered colors with semantic surface/text tokens; strengthened muted text, badges, links, and inverse text.                                |
| P1       | `src/App.tsx`                       | Five chart elements had invalid accessible labels; one more needed review. Screen-reader users lacked valid chart semantics; WCAG 4.1.2.                    | Added image roles and explicit month/amount labels to each keyboard-focusable bar.                                                                    |
| P1       | `src/components.tsx`, `src/App.tsx` | Overlay focus could reset on renders, escape into background content, or disappear on close. Hidden mobile navigation remained focusable; WCAG 2.1.1/2.4.3. | Stable callbacks, focus trapping/restoration, inert backgrounds, scroll locking, hidden closed navigation, and deliberate menu-to-dialog transitions. |
| P1       | `src/styles.css`                    | Enlarged text could push filtering controls outside their visible container; WCAG 1.4.4.                                                                    | Bounded flexible filter containers, independently scrollable tabs/table, wrapping controls and long text.                                             |
| P2       | `src/styles.css`                    | Small controls, including a 31×38 menu and 39px header buttons, were hard to tap.                                                                           | Minimum 44px control heights and icon widths, including service-name buttons.                                                                         |
| P2       | `src/styles.css`, `src/App.tsx`     | Tiny labels and form text reduced readability; required fields were not explicitly explained.                                                               | Rem-based type, stronger minimum sizes, 16px form inputs, required markers and explanatory text.                                                      |
| P2       | `src/App.tsx`, `src/components.tsx` | Clickable rows lacked native button semantics; errors and action status changes were not consistently announced.                                            | Native service buttons, skip link, navigation/selection states, labeled table region, alert/status semantics.                                         |
| P2       | `src/styles.css`, `public/fonts`    | Layout-property animation and external font loading added avoidable work and dependency. Detector: `layout-transition`.                                     | Removed height animation, self-hosted licensed fonts with swap, intentional reduced-motion feedback.                                                  |
| P2       | `src/styles.css`                    | Repeated raw colors and a decorative calendar side stripe caused system drift. Detector: `side-tab`.                                                        | Semantic tokens, consistent focus/selection styles, and a compact calendar color dot. Merchant brand swatches intentionally remain data-driven.       |
| P2       | `src/api.ts`, `src/AgentChat.tsx`   | Requests could wait indefinitely and transport failures were unclear.                                                                                       | Request deadline, abort propagation, and clear network/response errors.                                                                               |

## Verification

- axe WCAG A/AA checks: no violations on overview, subscriptions, payment calendar, savings, activity, add form, connections, subscription details, and the loaded assistant. Checked desktop and key mobile surfaces.
- Remaining `incomplete` results require human interpretation; confirmed overview items were decorative, aria-hidden merchant initials beside full service names. These were not silently counted as automated passes.
- Keyboard checks exercised Tab/Shift+Tab wrapping, Escape, return to the add-subscription trigger, and mobile menu-to-dialog isolation.
- Chromium viewport checks at 390px and 1440px, including 200% root text, found no page-level horizontal overflow. At enlarged mobile text the filter/search/sort containers remained inside the available width. Tables and filter tabs may scroll independently.
- `npm test`: 11 passed. `npm run test:integration`: passed. `npm run build`: TypeScript and Vite passed.
- Final deterministic detector: zero findings.

## Scope and remaining validation

No confirmed issue from this audit remains open. This is not a claim that every device or assistive technology is covered: physical touch, screen-reader operation, other browser engines, real-user performance, and a future dark theme remain untested. A rendered mobile viewport is layout evidence, not proof of touch interaction.

The system already had useful foundations: evidence provenance, unknown-usage states, explicit test-account labels, exact change approvals, and post-action receipts. Those were preserved. Functional integration limitations are documented in `README.md` and `docs/verification.md`.
