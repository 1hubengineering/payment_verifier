I recommend building this as a separate, deployable Live Verification Playground within our existing repository, using the actual payment verification SDK.

It should be an interactive developer testing environment—not a simulated checkout page. You should be able to configure an expected payment, submit a real CBE or Telebirr reference, and inspect the complete verification process and result.

Here is the enhanced implementation plan and prompt for your AI coding agent.

# Implementation Plan — Live Payment Verification Playground

**Project:** AndHub Payment Verifier\
**Repository:** `1hubengineering/payment_verifier`\
**Feature:** Live Verification Playground & Developer Testing Dashboard\
**Target:** Pre-V1\
**Priority:** Separate, independently deployable application\
**Status:** Proposed

## 1. Objective

Build a professional, interactive web application that allows us to test, demonstrate, and debug our existing CBE and Telebirr payment verification library against real official provider receipts.

The application must run locally or be deployed to a cloud server without requiring modifications to the core library.

It must use the **actual SDK and provider adapters from our repository**, not duplicate their verification logic.

The primary goal is to allow a developer or authorized tester to:

1. Configure the expected payment details.
2. Select the payment provider.
3. Enter a transaction number, CBE receipt ID, official receipt URL, or full SMS.
4. Submit a real verification request.
5. Observe the verification status and detailed diagnostics.
6. Compare the official receipt information against the expected configuration.
7. Test success, mismatch, invalid input, and provider failure scenarios.
8. Troubleshoot provider integrations before releasing V1.

This is a developer testing playground, not a production payment gateway or merchant checkout.

---

## 2. Technology and architecture

Use the existing repository's stack and conventions.

Preferred technologies:

- React + TypeScript for the web interface.
- Existing UI component libraries and design tokens where appropriate.
- Fastify for the backend.
- Vite+ for the development toolchain.
- Varlock for server environment configuration.
- Existing payment verification SDK.
- Existing Telebirr and CBE provider adapters.
- Existing storage abstraction and database adapters.
- Docker for portable local and cloud deployment.

Do not introduce an unnecessary second backend framework or rewrite the verification engine.

Suggested application location:

`apps/verification-playground/`

Organize the code into frontend, backend, configuration, and deployment-related modules as needed.

### Architecture

```
┌───────────────────────────────────┐
│      Verification Playground      │
│          React Frontend           │
│                                   │
│   Expected Payment Configuration  │
│   Provider / Input Selection      │
│   Verification Results            │
│   Diagnostics and History         │
└────────────────┬──────────────────┘
                 │ HTTPS
                 ▼
┌───────────────────────────────────┐
│         Fastify Backend           │
│                                   │
│   Authentication / Authorization  │
│   Server-side Input Validation    │
│   Test Expectation Management     │
│   Rate Limits / Admission         │
└────────────────┬──────────────────┘
                 │
                 ▼
┌───────────────────────────────────┐
│     Actual Payment Verifier SDK   │
│                                   │
│   Input Detection                 │
│   Official Receipt Retrieval      │
│   Receipt Parsing                 │
│   Expected vs Actual Comparison   │
│   Verification Result             │
└────────┬────────────────┬─────────┘
         │                │
         ▼                ▼
   Telebirr           CBE Receipt
   Official           Official
   Receipt            Receipt
   Service            Service
```

The browser must never directly retrieve or verify bank receipts.

All official receipt retrieval must happen through the backend and existing provider implementations.

## 3. User interface and layout

Develop a polished, responsive developer dashboard.

The application should have a clear distinction between:

- Expected payment configuration.
- Submitted payment evidence.
- Verification result.
- Technical diagnostics.

### Recommended desktop layout

Use a two-column workspace.

**Left panel — Expected Payment Configuration**

A form for defining the payment expectation against which the official receipt will be compared.

**Right panel — Verification Playground**

A testing form for submitting payment evidence and inspecting the verification result.

Below the two panels, provide a detailed verification report.

On mobile devices, stack the sections vertically without losing functionality.

The interface should prioritize readability, speed, and practical developer workflows rather than excessive visual effects.

---

## 4. Expected payment configuration

Allow the tester to configure the following fields.

### Basic payment information

| Field                              | Requirement                                             |
| ---------------------------------- | ------------------------------------------------------- |
| Payment provider                   | Telebirr / CBE                                          |
| Invoice or order number            | Required under the configured reference-matching policy |
| Expected amount                    | ETB, allowing two decimal places                        |
| Currency                           | ETB                                                     |
| Recipient account holder name      | Required                                                |
| Recipient account or wallet number | Required according to supported provider matching rules |
| Payment start date/time            | Configurable                                            |
| Payment expiration date/time       | Configurable                                            |
| Payment type                       | Provider-specific when applicable                       |

Automatically create valid internal test payment and tenant identifiers where needed.

Display a generated internal payment ID separately from the invoice/order reference that the bank receipt is expected to contain.

### Recipient account matching

Support the actual account-matching capabilities of the SDK.

For example:

- Full account match when officially available.
- Masked account or last-four-digit matching where that is the evidence exposed by the provider.

Clearly display which matching rule is being used.

Do not claim that a full account was verified if the official receipt exposes only a masked number.

### Amount matching policy

Integrate with the planned amount-tolerance feature when it exists.

Allow the tester to choose:

- Exact match — default.
- Configurable tolerance.

If tolerance is enabled, expose:

- Maximum allowed underpayment.
- Maximum allowed overpayment.
- Fixed ETB amount or percentage for each direction.

Show the calculated minimum and maximum acceptable payment amounts.

Example:

Expected: 100.55 ETB\
Allowed underpayment: 0.60 ETB\
Allowed overpayment: 0.50 ETB

Accepted range: 99.95–101.05 ETB.

**Important:** Do not implement a separate amount comparison engine in the playground. Use the SDK's actual amount-policy behavior.

If the SDK feature is not yet implemented, mark it as pending and keep exact matching active. Do not simulate tolerance as though it were supported.

### Configuration management

Allow users to:

- Reset to defaults.
- Save a named test configuration.
- Load a previously saved configuration.
- Duplicate a configuration for another test.
- Create a fresh test payment expectation.

A saved draft must not silently change an already registered immutable expectation.

When the expectation changes, create a new verification scenario or explicitly register a new expectation rather than mutating an existing one in place.

Store persistent configurations on the server and scope them to the authorized user.

## 5. Verification input playground

Provide an input section with the following elements.

### Payment provider selector

Show:

- Auto Detect
- Telebirr
- CBE

**Auto Detect** should be the default for recognizing the submitted evidence format.

The selected provider in the expected payment configuration remains authoritative.

If the detected provider differs from the configured expected provider, return an explicit `PROVIDER_MISMATCH`.

Selecting a provider in the input section must not silently override the expected payment provider.

### Unified payment input

Provide one main text input or auto-resizing textarea that accepts:

**Telebirr**

- Transaction/reference number.
- Official receipt URL.
- Full SMS message.

**CBE**

- Unique receipt ID beginning with `v2-`.
- Official receipt URL.
- Full SMS message.

The input should handle both short references and multiline messages.

Example placeholders:

Telebirr:

`SYNTHR1234`

CBE:

`v2-SYNTHETIC_DEMO_42`

Use synthetic examples as initial defaults. Do not automatically submit real historical transactions.

### Live input detection

As the tester types or pastes a value:

- Detect the likely provider.
- Detect the input format.
- Extract the verification identifier.
- Validate basic format.
- Display a helpful parsing result.

Example:

```
{
  "provider": "cbe",
  "inputType": "sms",
  "identifierKind": "receipt_id",
  "identifier": "v2-EXAMPLE123"
}
```

Label this information as **Input Parsed**, not Payment Verified.

Client-side parsing should use the browser-safe shared SDK parser.

The server must independently validate the input again.

### Submission behavior

Provide a prominent **Verify Payment** button.

On submission:

1. Validate the expected payment configuration.
2. Validate the evidence input.
3. Create or resolve the server-side test expectation.
4. Call the real SDK verification workflow.
5. Retrieve the official receipt through the appropriate provider adapter.
6. Display the verification result.

Prevent accidental concurrent duplicate submissions from the same interface.

Support cancellation when practical, without implying that cancellation rolls back already committed database operations.

---

## 6. Verification result panel

Display the result prominently, with detailed information below it.

Support the agreed verification statuses:

- `VERIFIED`
- `MISMATCH`
- `NOT_FOUND`
- `UNAVAILABLE`
- `INVALID_INPUT`

Use the actual SDK contract once implemented.

Do not create misleading UI-only statuses.

### Result summary

Display:

- Verification status.
- Exact result/error code.
- Provider.
- Verification ID.
- Payment/test scenario ID.
- Verification timestamp.
- Duration.
- Whether a fresh retry is recommended.

Do not label a provider outage as an invalid receipt.

### Expected vs actual comparison

Display a structured table.

| Verification field       | Expected         | Official receipt | Check |
| ------------------------ | ---------------- | ---------------- | ----- |
| Provider                 | Telebirr         | Telebirr         | PASS  |
| Transferred amount       | 100.55 ETB       | 100.00 ETB       | FAIL  |
| Recipient name           | Example Merchant | Example Merchant | PASS  |
| Recipient account suffix | 1123             | 1123             | PASS  |
| Invoice reference        | INV-1024         | INV-1024         | PASS  |
| Transaction status       | Successful       | Successful       | PASS  |

For mismatches:

- Clearly highlight the mismatched field.
- Show expected and actual values.
- Show the exact reason code.
- Show signed amount differences when relevant.
- Preserve multiple failed or incomplete checks.

Use the SDK's check results directly rather than recomputing them independently in the UI.

### Developer diagnostics

Add an expandable section with:

- Verification stage.
- Exact error code.
- Developer-readable message.
- Retryability.
- Provider HTTP status when available.
- Request timeout information.
- Receipt retrieval duration when measured.
- Parsing or rendering duration when measured.
- Official receipt extraction details.
- Parser version.
- Safe receipt provenance information.

Expose a formatted JSON view of the actual SDK result.

Add a **Copy JSON** action.

Provide a sanitized diagnostics export if useful for bug reports.

Do not expose sensitive internal information unnecessarily, such as server credentials, raw authentication tokens, database URLs, or unrestricted HTML.

---

## 7. Live and simulated testing modes

Provide two clearly distinguished testing modes.

### Live Verification

Calls the real SDK and official CBE/Telebirr receipt services.

Requirements:

- Use the existing official provider adapters.
- Use real server-side verification.
- Respect timeout, concurrency, and rate limits.
- Never fabricate a successful result.
- Preserve accurate provider and parsing errors.
- Clearly label results as LIVE.

The user supplies real payment evidence and expected details when conducting authorized tests.

### Mock / Offline Verification

Use synthetic fixtures and local mock providers to demonstrate:

- Successful verification.
- Amount mismatch.
- Recipient mismatch.
- Invoice mismatch.
- Missing receipt.
- Provider timeout.
- Provider unavailable.
- Invalid identifier.
- Ambiguous input.
- Provider mismatch.

Clearly label mock results as SIMULATED.

Mock results must never be presented as real bank verification.

Avoid adding artificial delays or loading animations unless useful for demonstrating asynchronous behavior.

---

## 8. Testing history and comparison

Provide a session-level verification history.

Each record should show:

- Test timestamp.
- Test mode.
- Provider.
- Test scenario/payment ID.
- Verification status.
- Specific error code.
- Duration.
- Link to the detailed report.

Allow users to reopen previous results and compare repeated checks.

Support a **Run Again** action that creates a new verification attempt according to the SDK's idempotency contract.

Do not accidentally reuse an old idempotency key when the intention is to perform a fresh verification.

If the previous attempt's outcome is uncertain, recover that attempt using the original key before starting a new one.

Persist only the fields necessary for diagnostics and auditability.

Make retention configurable, with safe cleanup of expired test data.

---

## 9. Error handling and user messaging

The playground is a developer tool, so it should show precise technical errors.

Examples:

**Provider timeout**

`UNAVAILABLE / PROVIDER_TIMEOUT`

Explain that the official receipt request exceeded the timeout and verification was not completed.

**Amount mismatch**

`MISMATCH / AMOUNT_UNDERPAID`

Show the expected amount, actual amount, and difference.

**Invalid input**

`INVALID_INPUT / INVALID_IDENTIFIER`

Explain which validation rule failed.

**Provider mismatch**

`INVALID_INPUT / PROVIDER_MISMATCH`

Show the configured provider and detected provider.

**Receipt not found**

`NOT_FOUND / RECEIPT_NOT_FOUND`

Use this only if the SDK obtained a recognized provider confirmation that the receipt was absent.

Do not interpret an arbitrary HTTP 404 as proof that the receipt identifier is invalid.

The application should demonstrate how developers receive accurate errors without hiding the underlying causes.

---

## 10. Backend API and security

The playground must use a real backend.

Do not deploy it as a static-only application that attempts to contact the providers directly from the browser.

Provide appropriate backend endpoints for:

- Authentication.
- Test configuration management.
- Payment expectation registration.
- Input parsing and verification.
- Verification status.
- Test history.
- Safe diagnostics.

Follow existing API conventions where practical.

### Authentication and authorization

The live playground must not be publicly usable without authorization.

Implement secure administrator/tester access appropriate for a small internal tool.

For the initial deployment, a single authorized administrator account is sufficient.

Protect all live verification routes, configuration data, and history.

### Request protection

Include:

- Server-side schema validation.
- Strict request-size limits.
- Authentication.
- Authorization.
- Rate limiting.
- Verification concurrency limits.
- Timeouts.
- No-store cache headers for sensitive responses.
- CSRF protection when using cookie-based authentication.
- Secure session management.
- Appropriate security headers.

### Provider safety

- Build receipt URLs internally from validated identifiers.
- Never fetch arbitrary customer-provided URLs.
- Preserve official domain and path allowlists.
- Preserve TLS and DNS protections.
- Preserve CBE Chromium sandboxing and resource restrictions.
- Preserve existing duplicate transaction claims and idempotency.
- Avoid unnecessary live requests to bank infrastructure.

The playground must not become an unrestricted receipt lookup service.

### Sensitive information

Do not log or persist full customer SMS contents by default.

Mask or redact sensitive account information when displayed or stored.

Provide explicit opt-in diagnostic retention if needed for internal debugging, with appropriate access controls and expiration.

Do not transmit live receipt content to third-party analytics services.

---

## 11. Local and cloud deployment

The application must be deployable in both environments.

### Local development

Provide clear commands to:

1. Install dependencies.
2. Configure Varlock.
3. Initialize the development database.
4. Start the backend.
5. Start the frontend.
6. Enable live or mock verification.
7. Stop services and clean up resources.

Provide a simple local Docker Compose workflow where useful.

### Cloud deployment

Provide production-ready Docker configuration for a Linux server.

The deployment should support:

- A VPS.
- Railway or another compatible container hosting platform.
- Any Docker-capable infrastructure meeting the CBE browser requirements.

Use a multi-stage build when appropriate.

The container must include the required Playwright browser runtime and system dependencies for live CBE verification.

Do not disable Chromium sandboxing simply to make deployment easier.

If a hosting environment cannot meet the required browser security restrictions, clearly report that limitation and recommend a compatible deployment environment.

Configure:

- HTTPS.
- Protected environment secrets.
- Persistent database storage.
- Health checks.
- Graceful shutdown.
- Resource limits.
- Log rotation.
- Controlled live verification concurrency.
- Restart and recovery behavior.

Document CPU, memory, disk, and browser requirements based on actual measurements or clearly labeled estimates.

A local SQLite deployment is acceptable for initial testing. Support an existing PostgreSQL/MySQL adapter when configured, without imposing a separate database requirement on every installation.

---

## 12. Performance and provider diagnostics

Add a small diagnostics section showing measurements from actual verification attempts.

Where measurable, report:

- Input parsing duration.
- Provider retrieval duration.
- CBE browser rendering duration.
- Receipt comparison duration.
- Total verification duration.
- Failure stage.
- Timeout or cancellation reason.

Do not claim precision where measurements are unavailable.

Support repeated tests without uncontrolled parallel requests.

Do not perform aggressive load tests against live CBE or Telebirr infrastructure.

Performance stress testing must use local provider mocks.

---

## 13. Integration requirements

This playground is an SDK consumer, not an alternative verification implementation.

Do not duplicate:

- Provider-specific receipt parsing.
- Receipt validation logic.
- Amount comparison logic.
- Identifier detection logic.
- Duplicate transaction claim logic.
- Status/error classification.

Use existing SDK exports or introduce small, justified public APIs when the library lacks a necessary integration point.

If the clean verification response contract, automatic input detection, or configurable amount tolerance is still under development, identify those dependencies before implementing them.

Do not silently recreate missing library functionality inside the playground to make a demonstration appear complete.

Keep unrelated core-library refactoring outside this task.

## 14. Testing requirements

Add automated tests covering:

- Configuration validation.
- Test expectation creation.
- Provider selection and auto-detection.
- Telebirr transaction ID, URL, and SMS.
- CBE `v2-` ID, URL, and SMS.
- Frontend and backend validation consistency.
- Expected-provider conflicts.
- Successful synthetic verification.
- Amount, recipient, and invoice mismatches.
- Exact and tolerated amount behavior where supported.
- Accurate timeout and network error reporting.
- Unknown or malformed identifiers.
- Multiple simultaneous verification attempts.
- Duplicate claim protection.
- Idempotency and retry behavior.
- Protected live endpoints.
- Sensitive-data redaction.
- Browser-only parsing without Node dependencies.
- Docker build and local startup.
- Verification history and retention.

Use synthetic receipts and local provider mocks for automated tests.

Add a documented manual smoke-test checklist for authorized live Telebirr and CBE receipt verification.

The successful CBE Playwright proof of concept should be compared with the current adapter to ensure the playground exercises the working implementation.

## 15. Implementation phases

### Phase 1 — Repository audit

Inspect existing SDK APIs, provider adapters, tests, web checkout, and examples.

Identify reusable components and missing integration points.

Provide a concise implementation plan before coding.

### Phase 2 — Backend and configuration

Build the protected backend, test expectation handling, validation, SDK integration, and persistent test history.

### Phase 3 — Frontend playground

Implement the configuration form, provider selector, unified input field, and verification result dashboard.

### Phase 4 — Live and mock modes

Wire the official providers and mock testing infrastructure through the same SDK contract.

### Phase 5 — Diagnostics and developer experience

Add detailed comparison results, JSON inspection, retry controls, saved test configurations, and useful error explanations.

### Phase 6 — Deployment and verification

Create local and cloud deployment configurations.

Run automated tests, container startup tests, and controlled live smoke tests where authorized.

Update documentation and report results.

---

## 16. Definition of done

The playground is complete when:

- It runs locally and can be deployed securely to compatible cloud infrastructure.
- An authorized tester can configure the expected CBE or Telebirr payment details.
- It accepts the six agreed input formats.
- It uses the real SDK for verification.
- It independently revalidates all customer inputs on the backend.
- It retrieves official receipts in live mode.
- It displays exact expected-versus-actual comparisons.
- It returns accurate verification statuses and diagnostics.
- It distinguishes simulated verification from live verification.
- It preserves the SDK's existing security, duplicate protection, and idempotency.
- It supports protected test history and repeatable scenarios.
- It includes a responsive interface, tests, documentation, and deployable Docker configuration.

## 17. Agent delivery instructions

Implement this as a separate application in the existing monorepo.

Do not replace the current checkout demo unless a clearly reusable component is being shared.

Do not rewrite the verifier core, change the toolchain, or duplicate payment verification functionality.

Breaking changes are acceptable during pre-V1 development, but preserve working security and verification behavior.

Do not publish a new npm package or publicly deploy the playground without explicit authorization.

When complete, provide:

1. Application structure and files changed.
2. Local startup instructions.
3. Cloud deployment instructions.
4. Authentication and environment configuration instructions.
5. Screenshots or a walkthrough of the interface.
6. Test results.
7. Confirmed live provider behavior and remaining limitations.
8. Any SDK features that must be completed before V1.

**Final goal:** Deliver a reusable, secure developer playground where we can configure an expected payment, submit real CBE or Telebirr payment evidence, verify it using our actual library, and inspect exactly what happened at every stage.

## Recommended interface

Payment Verification Playground

Proposed dashboard layout

Design concept

Expected payment

Provider

Telebirr

Invoice number

INV-2026-0012

Expected amount

100.55 ETB

Recipient account

•••• 1123

Amount policy

Exact match

Test verification

Input provider

Auto Detect

Transaction / URL / SMS

Paste payment evidence...

Detected input

Awaiting input

Verify Payment

Verification report

Expected vs. actual

| Transaction status | Pending test |
| ------------------ | ------------ |
| Amount             | —            |
| Recipient          | —            |
| Invoice reference  | —            |

Detailed diagnostics and JSON output below the report

One design decision I particularly recommend is making the playground useful for both manual testing and debugging. Instead of only displaying a green or red result, it should show what the library extracted, which provider was contacted, what the official receipt contained, and exactly which checks passed or failed. That will make the playground valuable throughout development and after V1.
