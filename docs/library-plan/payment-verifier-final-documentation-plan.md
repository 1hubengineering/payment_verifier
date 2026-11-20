# Payment Verifier v0.3.0 — Final Documentation Improvement Plan

## Objective

Reorganize and improve the Payment Verifier documentation so that a developer or AI coding agent with no prior project knowledge can understand, integrate, test, deploy, and troubleshoot the SDK without inventing missing behavior or relying on private project knowledge.

Answer important questions immediately, or direct the reader to the exact authoritative page that answers them. Success is a correct integration built from the documentation alone—not the number of pages written.

**Target baseline:** v0.3.0. Establish the applicable published-release baseline during the initial audit; do not assume v0.3.0 is still the latest release. This document is a work plan, not a claim that repository behavior, examples, or deployments have already been validated.

## 1. Audit the implementation, release baseline, and existing documentation

Before editing, inspect the existing documentation, published packages, public exports, release artifacts, source, relevant tests, and available documentation tooling.

Record which release each guide and example targets. Distinguish published functionality from unreleased main-branch changes, planned features, and behavior awaiting authorized live-provider validation. Do not describe a capability as supported merely because a planning document mentions it.

Build one authoritative documentation structure. Preserve accurate material and historical documentation; improve existing pages and cross-links before creating overlapping guides.

Include release compatibility, breaking changes, runtime support, fresh verifier-store requirements, legacy-store limitations, and migration guidance. Do not describe active v0.1.1 store upgrades as supported unless the required claim-preserving cutover has been validated.

**Implementation boundary:** This is documentation work. Do not change SDK behavior, invent APIs, or introduce unrelated breaking changes to make examples work. Record missing features and implementation gaps separately, with evidence and recommendations.

## 2. Start with a one-minute introduction

The root README and documentation homepage must immediately explain the problem the SDK solves, supported providers and evidence formats, the typical verification workflow, what successful verification establishes, what the application must supply, and where the reader should go next.

Make money flow explicit: customers transfer funds directly to the merchant’s designated bank account or mobile-money wallet. Payment Verifier does not receive, hold, or transfer those funds, provide merchant accounts, operate customer wallets, or maintain the application’s financial ledger.

Describe the SDK’s complete scope: supported evidence handling, official receipt retrieval and comparison, structured verification outcomes, and verification-specific persistence for its documented claim and idempotency guarantees.

Keep the introduction short. Link to detailed explanations rather than embedding the entire architecture or API reference in the README.

## 3. Explain who owns what

Add a prominent **Who Owns What? / SDK vs. Application Responsibilities** section.

| Area                            | Responsibility to document                                                                                                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Merchant and business domain    | The application owns payment accounts, products, prices, customers, orders, invoices, authentication, authorization, financial records, balances, fulfillment, refunds, and reconciliation. |
| Database infrastructure         | The developer provisions and operates the database, including access control, backups, maintenance, and retention policies.                                                                 |
| Verification records            | The SDK reads and writes the records required by its supported workflows through the configured storage adapter.                                                                            |
| Business effects and operations | The application owns order-state updates, repeat-safe fulfillment, hosting, worker operation, customer notifications, and operational escalation.                                           |

Use this distinction consistently:

> Your application owns and operates the database. The SDK reads and writes the verification records required by its documented workflow through your configured storage adapter.

Do not imply that the SDK stores nothing, operates a hosted database, or becomes the application’s financial ledger or financial source of truth. Explain how successful verification feeds the application’s payment-confirmation workflow without making its order updates automatically atomic or repeat-safe.

## 4. Provide a complete getting-started path

Organize Getting Started in this order: prerequisites and package selection; installation; provider configuration; database provisioning and storage configuration; SDK initialization; trusted expected-payment creation; customer evidence submission; verification; result and operation-error handling; application-owned order confirmation and recovery.

Provide two clearly labeled examples:

- **Offline learning example:** A small executable comparison example that does not contact a provider or imply persistent official verification.
- **Complete persistent checkout example:** A realistic e-commerce flow using the documented release’s public APIs, provider configuration, persistent storage, claims, result handling, and repeat-safe application updates.

The persistent example must show where the expected amount, recipient information, merchant invoice/reference, and customer evidence come from. Explain how application records map to the actual API fields; do not invent a field merely to fit the example.

Include all essential setup. Do not leave objects such as `storage` unexplained. Identify required provider credentials, account arrangements, environment configuration, runtime dependencies, database initialization or migrations, and external services according to the actual integration.

Show how the application handles an inconclusive result without incorrectly marking the order unpaid or asking the customer to pay again. Link to the full recovery guide rather than compressing recovery into an unsafe catch-all handler.

## 5. Explain evidence, identifiers, and trust boundaries

Document the supported identifier, URL, and SMS formats for each provider. Explain that customer evidence supplies a lookup identifier, while expected payment values come from authorized server-owned records.

Show how the server constructs the official receipt lookup URL and retrieves the receipt through the configured provider adapter. Customer-provided amounts, recipient names, SMS success statements, screenshots, and frontend success responses must not substitute for appropriate verification.

Explicitly distinguish:

| Concepts                                                       | Required clarification                                                                   |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Merchant invoice/reference vs. provider transaction identifier | Explain their different purposes and actual API mappings.                                |
| CBE receipt lookup token vs. official bank transaction ID      | Preserve the lookup token’s case sensitivity and explain which identifier is used where. |
| Input recognition vs. verification                             | Recognizing a supported input format does not establish payment success.                 |
| Offline `MATCH` vs. backend `VERIFIED`                         | Explain the different evidence sources, checks, and persistence guarantees.              |
| Account-suffix matching vs. full-account matching              | State what the implementation actually compares and the resulting limitation.            |

Describe only the checks the implementation performs. Do not imply access to evidence or account information it does not obtain.

## 6. Document persistence, schema flexibility, and adapter guarantees

### Verification data inventory

Provide an accurate inventory of the exact fields, purpose, and lifecycle of trusted expectations, verification attempts and results, official transaction claims, idempotency bindings, normalized receipts, and source metadata. Include outbox events and durable-job records where the relevant workflow uses them.

For each record type, identify whether it is required or optional, what creates or updates it, and what retention or deletion behavior actually exists. State any encryption behavior accurately rather than assuming it is provided.

Explain that an unsuccessful or incomplete verification can still create an attempt, diagnostic, or job record. It must not be presented as a successful transaction claim.

Describe data minimization concretely: whether raw SMS text, receipt HTML, balances, or sensitive identifiers are retained; what happens by default; and what optional diagnostics change. Separate SDK records from application-owned financial and order records.

### Database and adapter integration

Document supported databases, ORMs, ready-made adapters, migrations, adapter interfaces, and a working custom-adapter example.

Use this schema rule:

> Supplied schema templates are optional when using a compatible custom adapter. Ready-made adapters require their documented schema or supported mappings. Every adapter must preserve the SDK’s storage guarantees.

Explain required uniqueness, atomic verified-claim persistence, transaction isolation, concurrency behavior, idempotency, and recovery semantics. Document the contract’s actual serializable behavior or equivalent locking and unique-insert requirements; do not imply that any arbitrary schema is compatible.

State the scope of duplicate protection. Separate, uncoordinated stores must not be described as providing global duplicate prevention.

Explain the consistency boundary between committing an SDK claim and updating application-owned order records, including caller-owned transactions where supported. The checkout example must not assume that a successful SDK call automatically commits every business effect.

## 7. Complete the results, guarantees, amount policies, and API reference

### Results and operation errors

Document all five verification statuses: `VERIFIED`, `MISMATCH`, `NOT_FOUND`, `UNAVAILABLE`, and `INVALID_INPUT`.

Keep operation errors separate. Cover duplicate claims, idempotency conflicts, expectation-state errors, and storage failures using the release’s actual error model. For the v0.3.0 baseline, verify and document `VerificationOperationError` and its exported codes. Do not create a sixth “duplicate” verification status.

For every status and operation error, explain the triggering conditions, returned fields, failure stage, retry semantics, and expected application response. Include realistic examples for success, mismatch, invalid input, duplicate claims, provider unavailability, and technical failures.

### Meaning of successful verification

Retain the successful-verification meaning from the first plan: the required official receipt checks passed and the applicable claim transaction completed. Document the actual status, amount, currency, recipient, reference, time-window, and duplicate-claim checks that apply.

For caller-owned transaction composition, make the outer commit boundary explicit. Do not imply a claim is durably committed merely because an inner operation returned successfully while its enclosing transaction remains uncommitted.

**Resolution of the source-plan difference:** Explain receipt-source and observation limitations without introducing receipt-only success labels or a mandatory separate settlement-confirmation stage. Additional merchant checks, where discussed, are optional application policies—not a newly invented SDK requirement. Do not promise irreversible funds, permanent account credit, or certainty about events outside the SDK’s observations.

### Amount policies and public interfaces

Document exact amount matching as the default and the actual supported tolerance configuration. Cover underpayment, overpayment, monetary precision, rounding, limits, inclusive boundaries, and truthful reporting of the amount received.

Maintain a complete reference for public packages and exports, initialization, configuration, expected-payment fields, provider adapters, evidence formats, comparison and verification APIs, result types, error codes, storage contracts, idempotency, and available durable-job or worker interfaces.

Use only real release-specific APIs. Link reference entries to executable examples and conceptual explanations.

## 8. Make recovery and customer protection impossible to miss

Immediately after Quick Start in the root README, add **Verification Failures & Recovery**, with direct working links to recovery, results, idempotency, and troubleshooting.

Display this warning prominently:

> An inconclusive verification does not prove that the customer failed to pay. A timeout alone must not trigger a request for another payment.

### Failure diagnosis and application recovery

Cover network timeouts, provider downtime, DNS and TLS errors, documented geographic or server-IP restrictions, receipt lookup failures, incomplete evidence, unexpected provider responses, missing Chromium, browser startup or rendering failures, storage errors, and idempotency conflicts.

Distinguish confirmed provider absence from an unexplained HTTP 404. Report known network causes accurately; do not infer geographic blocking from a timeout alone.

Explain pending-order states, progress visibility, bounded retries and backoff, retry exhaustion, escalation, manual merchant review, safe developer logging, and customer communication. These are application workflows around the SDK, not extra verification statuses.

### Idempotency and retry semantics

Keep these cases separate:

| Situation                                       | Required documented behavior                                                                 |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Lost response or uncertain completion           | Recover using the original key according to the SDK’s documented recovery behavior.          |
| Replay of a completed attempt                   | Return that attempt’s stored result; do not describe replay as a fresh provider observation. |
| New observation after a known completed outcome | Use the documented fresh-attempt mechanism when another check is appropriate.                |
| Changed or malformed evidence on a bound key    | Preserve the documented conflict behavior; do not teach a workaround that bypasses it.       |
| Repeated application processing                 | Make fulfillment and other business effects independently idempotent.                        |

### Synchronous verification, durable jobs, and application queues

Explain when to use synchronous verification, the SDK’s optional durable-job API, or the application’s existing queue. Document supported durable-job admission, persisted retries, leases, and recovery against the target release.

**Resolution of the source-plan difference:** Do not imply that every application must rebuild retry machinery already supplied by the SDK. Equally, do not imply that SDK jobs manage application orders, operate workers, send customer notifications, or make escalation decisions. Explain the responsibilities of the selected integration approach.

Customer-message examples must reflect implemented behavior. Do not promise that an order was saved, a retry was scheduled, or a notification will arrive unless the example actually performs that action.

## 9. Provide a dedicated security, privacy, and authenticity guide

Document the implemented security model and the integrating application’s responsibilities in one authoritative guide.

Cover trusted server-side expectations, untrusted customer evidence, official receipt-source validation, safe URL construction, server-side request forgery protection, provider-response integrity limitations, authentication, authorization, database access control, sensitive-data minimization, redaction, environment configuration, browser sandboxing, and repeat-safe financial business actions.

Distinguish protections enforced by the SDK from requirements the application must implement. Do not claim a protection exists without implementation evidence.

Cross-link this guide from Getting Started, provider configuration, storage integration, deployment, recovery, and the AI-agent guide. Keep security-relevant warnings next to the examples they affect.

## 10. Separate testing modes and document operational requirements

Use these distinctions consistently:

| Mode                        | Meaning and boundary                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Offline comparison          | Evaluates supplied evidence without contacting a provider.                                                    |
| Mocked integration tests    | Exercise application and SDK integration using controlled fixtures.                                           |
| Public synthetic playground | Browser-only demonstration using mock evidence, intended for GitHub Pages and independent of the private VPS. |
| Private live playground     | Authorized official-receipt verification with protected access.                                               |
| Synthetic benchmarking      | Controlled synthetic workloads, not load tests against official banking endpoints.                            |

Keep live-playground and benchmark controls internal. Public documentation may expose suitable demonstrations and reviewed reports, not unrestricted operational controls. Describe environments or capabilities as deployed or tested only when supported by evidence.

Document supported Node.js runtimes, local test commands, database initialization, browser and Chromium installation, sandbox requirements, provider connectivity, credentials where required, resource limits, worker operation, logging, performance considerations, troubleshooting, and Docker configuration where supported.

Separate **fresh-install and verifier-store requirements** from **payment timing and receipt observation**. A requirement for a fresh verifier store must not be presented as a requirement to clear the application’s business database. Explain payment validity windows and receipt transaction timestamps. An idempotent replay returns the original observation; it must not be presented as a new observation of a receipt.

**Do not load-test official banking endpoints.**

## 11. Make answers discoverable

Create a visible **Common Questions / Find Your Answer** hub. Each question must have a concise answer and a direct link to its authoritative detailed guide.

Cover purpose and money flow; supported providers and evidence; database ownership and custom schemas; payment verification and the meaning of `VERIFIED`; duplicate protection; timeouts and customer communication; safe retries; amount policies; testing without real payments; deployment; and version or upgrade restrictions.

Organize navigation around the reader’s task: understand the SDK, integrate a checkout, configure storage, handle results, recover from failure, deploy, or look up an API.

Avoid duplicating complete explanations across the README, FAQ, agent guide, and API reference. Keep one authoritative explanation with relevant cross-links, while preserving concise warnings where they are needed.

## 12. Publish a dedicated AI coding agent integration guide

Provide a deterministic checklist grounded in verified package references, real APIs, executable examples, storage contracts, security rules, and recovery guidance.

Require agents to inspect the host application before integrating. They must identify and reuse its authentication, authorization, database access, order models, and fulfillment workflow rather than inventing a parallel business system.

The checklist must guide the agent through selecting the correct release and packages, configuring persistent storage and providers, creating trusted expectations, accepting untrusted evidence safely, handling all results and operation errors, implementing documented retry semantics, protecting fulfillment from repetition, and running relevant synthetic tests.

Include explicit prohibited assumptions: do not invent SDK methods, duplicate provider verification logic, create unnecessary wallets or ledgers, treat offline matching as backend verification, trust client-owned expected amounts, assume global duplicate protection across separate stores, or assume durable jobs manage customer notifications.

Reference existing agent skills and documentation tools where available. Require the agent to record missing capabilities or unresolved questions rather than silently filling gaps.

## 13. Execute in a clear order and deliver a complete handover

After the initial audit, prioritize work as follows:

| Priority | Work package                           | Required output                                                                                               |
| -------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1        | Root README and documentation homepage | Clear introduction, ownership summary, integration entry points, and recovery notice.                         |
| 2        | Getting Started and checkout           | Working offline example and complete persistent integration.                                                  |
| 3        | Responsibilities and persistence       | Data inventory, database and adapter guidance, custom-adapter example, and consistency boundaries.            |
| 4        | Failure handling and recovery          | Result interpretation, correct retries, durable-job choices, and truthful customer messaging.                 |
| 5        | Reference and advanced guides          | Complete API/error reference, amount policies, security, deployment, testing, and compatibility guidance.     |
| 6        | Navigation and validation              | Common Questions hub, AI guide, working cross-links, acceptance evidence, and independent integration review. |

Security and release accuracy apply throughout; they are not deferred until the corresponding guide is written.

The handover must include the revised documentation, executable examples and setup instructions, a validation report with commands and results, and a gap register separating documentation problems from proposed SDK changes. Do not replace these deliverables with a page-count summary.

## 14. Track acceptance criteria with evidence

Use a validation report with **Criterion, Status, Evidence, and Remaining Gap** fields. Allowed statuses are **Passed**, **Failed**, and **Not Tested**. Unexecuted checks remain Not Tested; do not mark a runtime example as passing because it looks plausible.

| Acceptance criterion                                 | Required evidence                                                               |
| ---------------------------------------------------- | ------------------------------------------------------------------------------- |
| Release alignment and API accuracy                   | Relevant release/package references and audited public interfaces.              |
| Clear introduction, money flow, and ownership        | Documentation locations and newcomer feedback.                                  |
| Executable offline and persistent examples           | Setup instructions, commands, and observed results.                             |
| Correct evidence and identifier handling             | Release-supported format examples and relevant fixtures.                        |
| Accurate successful-verification guarantees          | Documented checks, limitations, and transaction-commit boundaries.              |
| Complete results and operation errors                | Reference coverage and examples for every public category.                      |
| Accurate persistence and custom-adapter requirements | Field inventory, schema guidance, and applicable contract/concurrency evidence. |
| Correct duplicate-protection scope                   | Documented storage boundary and duplicate/concurrent-claim test results.        |
| Correct amount policies                              | Examples or tests covering supported precision and tolerance boundaries.        |
| Safe retry and recovery semantics                    | Original-key recovery, stored replay, fresh-attempt, and conflict scenarios.    |
| Repeat-safe business effects                         | Evidence that repeated processing does not duplicate fulfillment.               |
| Honest customer messaging                            | Each promise traceable to behavior implemented in the example.                  |
| Security and privacy guidance                        | Documented responsibility boundaries and supporting implementation evidence.    |
| Distinct testing and playground modes                | Clear labels, access boundaries, and synthetic-only benchmark guidance.         |
| Accurate deployment and upgrade requirements         | Environment checks, supported versions, and documented migration limitations.   |
| Discoverable answers and working navigation          | Link-check results and task-based documentation review.                         |
| Effective AI integration guidance                    | Completed independent integration exercise and recorded findings.               |

Keep failed and untested items visible. Record the exact reason, affected documentation, and whether the gap requires documentation work, implementation work, or authorized live validation.

## 15. Validate with an independent newcomer

Give a developer or fresh AI coding agent with no prior project context only the published documentation and the integration task, with synthetic fixtures available through the documented setup.

Ask them to build a small persistent checkout, handle duplicate claims, and recover from provider unavailability or a timeout without duplicate fulfillment or misleading customer communication.

Record unanswered questions, missing instructions, confusing explanations, invented assumptions, invalid examples, broken links, and unexpected integration difficulties. Do not hide documentation gaps by supplying private explanations during the exercise.

Correct the documentation and repeat the affected parts of the exercise. Report results honestly; unresolved failures and untested claims must not be presented as completed validation.

**Final completion standard:** A newcomer can understand the SDK’s role, build a valid integration, handle failures accurately, and locate further answers using the published documentation alone. All applicable acceptance criteria have supporting evidence, and remaining limitations are explicitly recorded.

---

Source basis: the two supplied planning drafts, “Pasted text.txt” and “Pasted text (2).txt.” The successful-verification wording, retry ownership, and release-baseline differences are explicitly resolved above. No repository, deployment, or live-provider validation was performed while drafting this consolidated plan.
