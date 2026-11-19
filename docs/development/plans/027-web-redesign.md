# Payment Verifier web redesign

## Outcome and scope

Unify the public site and the authenticated playground with the Shadcnblocks Falcon theme. Explain receipt outcomes in a shared dialog and let users review completed attempts from history. Explain the published benchmark and give the operator benchmark the same metric vocabulary. Keep receipt verification, storage, and provider behavior in their existing owners.

## Page audit

| Route or view           | Finding                                                                                                                | Redesign                                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Home                    | Hero 1 adaptation, boxed receipt illustration, numbered link cards and duplicate promotional labels                    | Retain Hero 1 split with a receipt example. Simplify the navigation, developer paths and footer.                  |
| Guide                   | Generated Markdown and in-page navigation use undersized typography and dense outlines                                 | Keep release content and anchors. Give the guide a readable article column, section navigation and code surfaces. |
| API reference           | Native search field and repeated signatures have little hierarchy                                                      | Style the search as a shared control. Use the same code and reading surfaces as the guide.                        |
| Workspace preview       | Unstructured prose duplicates visual conventions already used in the guide                                             | Apply the guide typography, spacing, and code treatment.                                                          |
| Checkout demo           | Plain shadcn cards, button and field primitives coexist with custom radios, textarea and inline outcomes               | Keep useful primitives and the order summary. Standardize controls and show outcomes and history.                 |
| Synthetic playground    | Custom split form uses unstyled selects and textarea, radio tabs and a raw SDK result panel                            | Adopt shared controls, report dialog and attempt table.                                                           |
| Portal sign-in/password | Native controls in a bespoke centered card                                                                             | Apply the Login 1 form composition and shared controls.                                                           |
| Portal verification     | Native controls and green panels use a different theme. Saved attempts already exist but reports appear below the form | Use the shared theme and result dialog while retaining server history, comparison and recovery.                   |
| Public benchmark        | Aggregate table leads before the takeaway or an explanation of comparable workloads                                    | Lead with the equal-size success runs, then show run conditions, metric definitions, and aggregate data.          |
| Portal benchmark        | Raw JSON and unlabeled percentile bundles obscure the findings                                                         | Explain what each run measures and summarize the selected run before diagnostics.                                 |

## Steps

- [x] Apply one theme, shared control styles and suitable registry blocks.
- [x] Integrate result dialogs and histories into checkout, synthetic and portal verification.
- [x] Rewrite both benchmarks around comparable workloads and defined metrics.
- [x] Build, inspect every page in a browser, and run workspace verification.

## Decisions

The project owner confirmed that the project’s license permits using Pro blocks in this repository and website. Authenticated registry access worked for Pro Checkout 4 and Application Shell 4. The checkout uses Checkout 4’s payment and order columns. The portal uses Application Shell 4’s logo, section tabs and account action. Browser-only histories are kept in memory so pasted evidence does not become durable. The live portal uses the existing server history and its redaction policy.

## Validation

Build both web surfaces. Exercise matched, mismatched, and unavailable receipts with synthetic inputs. Check row activation, keyboard focus, loaded and no-report states, responsive layouts, benchmark interpretation and diagnostics. Run `pnpm verify` and review trust, redaction and recovery boundaries.

## Handoff

- `pnpm verify` passed with 363 workspace tests, 40 web tests, 297 storage contract tests and 11 frozen reference tests. It also passed builds, type checks, installed-package checks and documentation MCP smoke.
- Chromium covered all seven public routes at desktop and mobile widths, with keyboard and row-driven result review. The local operator smoke passed administrator authentication, three verification outcomes and comparisons between benchmark runs. Live-mode testing used an injected synthetic provider and confirmed that saved reports and JSON redact transient values.
- The standard portal image built and started locally. The packaged web server returned the page and local font with the expected media type. The shared UI package is a build dependency.
- The public benchmark shows the recorded aggregate runs. The operator benchmark exposes the stored full JSON for each completed run. These observations characterize synthetic SDK work in the recorded environments.
