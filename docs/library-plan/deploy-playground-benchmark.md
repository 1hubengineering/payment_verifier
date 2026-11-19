Here is the latest consolidated deployment plan for AndHub Payment Verifier, incorporating all our decisions.

The architecture is now finalized:

GitHub Pages — Public

Documentation & SDK Reference

Installation, API, supported providers, examples, and troubleshooting

Interactive Synthetic Playground

Browser-only simulated verification, no bank connections

Published Benchmark Reports

Reviewed performance results and hardware recommendations

Existing VPS — Private

Seeded Admin Login

Live Verification

Real CBE and Telebirr receipts

Benchmarking

Controlled tests and resource monitoring

The SDK targets `v0.2.0`. The playground and benchmarking tools remain private workspace applications without independent release versions.

# Master Deployment Plan — AndHub Payment Verifier v0.2.0

**Repository:** `1hubengineering/payment_verifier`\
**Target SDK version:** `0.2.0`\
**Infrastructure:** GitHub Pages + existing VPS\
**VPS access:** `ssh -t bingo-vps /bin/bash`\
**Status:** Approved architecture; implementation and deployment pending\
**Purpose:** Public demonstration, private live verification, performance benchmarking, and release validation.

---

## 1. Project Objective

Deploy and validate the Payment Verifier ecosystem using the existing monorepo and SDK.

This initiative must provide:

1. A public documentation website with an interactive synthetic verification playground.
2. A private, authenticated administration portal for real CBE and Telebirr payment verification.
3. A private benchmarking dashboard with controlled performance testing.
4. Public, reviewed benchmark summaries and deployment requirements.
5. Detailed documentation of deployment experiences, test results, technical problems, and recommendations.

The deployment must also help validate the upcoming SDK v0.2.0 release.

**Do not publish or approve the SDK release automatically as part of this deployment.**

## 2. Hosting and Infrastructure

### 2.1 Public — GitHub Pages

Keep the existing documentation website hosted on GitHub Pages.

Publicly accessible features:

- Documentation and installation instructions.
- API reference and SDK usage examples.
- Interactive synthetic verification playground.
- Published benchmark results.
- Hardware requirements and known limitations.
- Release notes and troubleshooting guides.

Do not migrate the documentation website to the VPS.

The synthetic playground must operate independently of VPS availability.

### 2.2 Private — Existing VPS

Deploy one protected admin portal containing:

- Live Verification Playground.
- Benchmarking Dashboard.
- Verification history and detailed diagnostics.
- Benchmark execution and historical reports.

Both tools must be accessible after signing in with one seeded administrator account.

Deploy the applications as isolated services, preferably using Docker Compose.

### 2.3 Infrastructure Isolation

The VPS may already host the Bingo platform and other services.

Before deployment:

- Inspect existing applications, ports, networks, reverse proxies, containers, and databases.
- Measure available CPU, RAM, and disk capacity.
- Identify safe deployment locations and resource limits.
- Verify Chromium and operating-system sandbox compatibility.

Do not stop, restart, modify, rebuild, or delete unrelated applications, databases, Docker volumes, or networks.

Do not perform disruptive global infrastructure changes without explicit approval.

## 3. Public Synthetic Verification Playground

Create an interactive frontend hosted on GitHub Pages.

Use React, TypeScript, and browser-compatible SDK functions.

### 3.1 Expected Payment Configuration

Allow users to configure:

- Payment provider: Telebirr or CBE.
- Invoice/order reference.
- Expected amount in ETB.
- Recipient name.
- Recipient account/wallet identifier.
- Payment validity window.
- Amount matching policy.
- Fixed or percentage underpayment/overpayment tolerance.

Use realistic synthetic defaults.

### 3.2 Payment Input

Provide three guided input tabs with icons:

1. Transaction/reference number.
2. Receipt URL.
3. Full SMS message.

Automatically identify the provider and extract the required identifier where supported.

The UI must accept:

- Telebirr transaction ID, URL, or SMS.
- CBE `v2-` receipt ID, URL, or SMS.

### 3.3 Synthetic Scenarios

Provide predefined mock scenarios covering:

- Successful verification.
- Underpayment.
- Overpayment.
- Accepted amount tolerance.
- Rejected amount tolerance.
- Recipient mismatch.
- Invoice mismatch.
- Invalid or ambiguous input.
- Provider mismatch.
- Receipt not found.
- Provider timeout.
- Unsupported receipt format.
- Duplicate transaction claim.
- Idempotency conflict.

Reuse browser-compatible SDK parsing and comparison logic wherever possible.

Simulate backend-only operations explicitly.

Never contact real CBE or Telebirr services from the public playground.

All simulated outcomes must be visibly marked **SIMULATED**.

### 3.4 Deployment

Build the synthetic playground as static assets within the existing documentation-site deployment.

Use the correct GitHub Pages base path and navigation.

No public playground backend is required.

## 4. Private Admin Portal

Develop one private web application for Live Verification and Benchmarking.

### 4.1 Authentication

Use **one seeded administrator account**.

Do not implement:

- Public signup.
- Registration.
- User invitations.
- Multi-user role management.
- OAuth/social login.
- Mandatory two-factor authentication.

### 4.2 Administrator Setup

Initialize the account using secure server-side configuration or a setup command.

Requirements:

- A configurable administrator email or username.
- A strong initial password provided through secure configuration.
- Argon2id password hashing.
- No plaintext password storage or logging.
- No automatic password overwrite during redeployment.
- First-login password change.
- Secure password reset/rotation through a server-side administrative command.

Use Varlock for environment configuration, following the existing repository conventions.

### 4.3 Session Security

Implement:

- HTTPS.
- Secure HttpOnly session cookies.
- Appropriate SameSite settings.
- CSRF protection where applicable.
- Login rate limiting.
- Session expiration.
- Logout.
- Server-side authorization on every private endpoint.

No private endpoint should become accessible simply by knowing its URL.

### 4.4 Administrator Access

After deployment, provide the administrator with:

- The actual private HTTPS portal URL.
- Login and initial-password setup instructions.
- Password-change instructions.
- Navigation to Live Verification and Benchmarking.
- Troubleshooting and access-recovery procedures.

Do not print administrator passwords in reports or commit them to Git.

An optional private VPN or IP allowlist can be considered as an additional protection.

## 5. Live Verification Playground

The Live Verification section must use the **actual v0.2.0 SDK and official provider adapters**.

Do not implement separate verification logic.

### 5.1 Expected Payment Configuration

Support:

- Provider.
- Invoice/reference number.
- Amount and currency.
- Recipient name.
- Recipient account information.
- Validity window.
- Amount matching policy.
- Maximum permitted underpayment and overpayment.
- Applicable provider-specific verification settings.

Allow saved test configurations and new test scenarios.

Do not silently mutate previously registered immutable payment expectations.

### 5.2 Payment Input

Support:

- Telebirr transaction number.
- Telebirr receipt URL.
- Full Telebirr SMS.
- CBE `v2-` receipt identifier.
- CBE receipt URL.
- Full CBE SMS.

Automatically detect the input format and provider.

Revalidate every input on the backend.

Construct official receipt URLs internally using validated identifiers.

### 5.3 Verification Results

Display:

- `VERIFIED`
- `MISMATCH`
- `NOT_FOUND`
- `UNAVAILABLE`
- `INVALID_INPUT`

Show the actual SDK contract, including precise diagnostic codes.

The result report must display:

- Expected and actual values.
- All verification checks.
- Actual transferred amount.
- Amount differences and tolerance policy.
- Recipient matching results.
- Invoice/reference matching results.
- Transaction status.
- Error stage and exact error code.
- Retryability.
- Provider retrieval and parsing information.
- Total verification duration.
- Safe JSON diagnostics.

Do not classify a timeout as an invalid receipt.

Do not call a mismatch fraudulent without supporting evidence.

### 5.4 Verification History

Store authorized test history with bounded retention.

Allow the administrator to review previous verification attempts and repeat tests using correct idempotency semantics.

Protect against duplicate transaction claims.

Do not log or persist raw SMS messages, full receipt HTML, balances, or sensitive credentials by default.

## 6. Benchmarking Dashboard

Provide a protected performance dashboard within the same administrator portal.

Use the SDK's actual execution path and measurement instrumentation.

### 6.1 Required Metrics

Measure, where observable:

- Input parsing duration.
- Provider retrieval duration.
- Receipt parsing duration.
- CBE browser startup and rendering duration.
- Comparison duration.
- Database transaction duration.
- Total verification duration.
- CPU utilization.
- Memory utilization and peak memory.
- Throughput.
- Concurrency.
- Error and timeout rates.
- p50, p95, and p99 latency.

Report sample sizes and measurement methodology.

### 6.2 Test Environment Specifications

Record:

- CPU model and vCPU count.
- RAM.
- Operating system and kernel.
- Storage characteristics.
- Node.js version.
- Docker configuration.
- Chromium/Playwright version.
- Database engine and adapter.
- SDK version and Git commit.
- Benchmark workload and parameters.

### 6.3 Safe Benchmark Execution

Use local mock provider services and synthetic receipts for repeatable load testing.

Do not load-test real CBE or Telebirr endpoints.

Implement:

- Concurrency limits.
- CPU and memory limits.
- Maximum execution time.
- Controlled workload size.
- Stop/cancel functionality.
- Resource monitoring.
- Failure recovery and cleanup.

Start with small workloads and increase gradually only when safe.

If the shared VPS cannot safely handle intensive benchmarks, execute those workloads on isolated infrastructure and import the results.

### 6.4 Benchmark Reports

Generate structured reports containing:

- Environment details.
- Test methodology.
- Latency statistics.
- Throughput.
- CPU and memory usage.
- Failure rates.
- Observed bottlenecks.
- Recommendations.
- Known limitations.

Reports must distinguish observed performance from estimates.

## 7. Public Benchmark Documentation

Publish only reviewed, sanitized summaries on GitHub Pages.

Public reports may include:

- Tested hardware specifications.
- Verified performance measurements.
- SDK and runtime versions.
- Supported concurrency observations.
- Resource usage.
- Relevant deployment guidance.
- Minimum and recommended hosting specifications when justified by sufficient measurements.

Do not automatically publish internal logs, sensitive receipts, private configuration, or administrative details.

## 8. SDK v0.2.0 Release Validation

The deployment must support validation of the planned v0.2.0 verification contract.

### 8.1 Idempotency

Confirm:

- A committed verification binds its idempotency key.
- Reusing the key with malformed or different evidence returns `IDEMPOTENCY_CONFLICT`.
- Replaying the original evidence returns the committed result.
- Replaying does not trigger another provider request.

### 8.2 CBE Browser Startup

Confirm:

- Missing Chromium or sandbox startup failures return `UNAVAILABLE`.
- The specific code is `RECEIPT_BROWSER_UNAVAILABLE`.
- The stage is `receipt_rendering`.
- A failed launch releases its concurrency slot.

### 8.3 Live Provider Tests

Follow the existing live smoke-test checklist.

Perform one controlled, authorized real-receipt verification per provider when suitable test evidence is available.

Verify actual receipt retrieval, data extraction, comparison, and diagnostics.

Do not perform live load tests.

If the authorized receipts are unavailable, mark the tests pending.

### 8.4 Fresh Installation Policy

v0.2.0 currently targets fresh installations.

Do not automatically upgrade active v0.1.1 stores until a tested cutover proves existing receipt claims survive.

Back up development stores before intentional resets.

Never reset unrelated VPS databases.

### 8.5 Release Gate

Before approving a release:

- Run `pnpm verify` from a clean checkout of the exact candidate commit.
- Confirm required hosted CI checks.
- Validate package exports and installed-consumer behavior.
- Complete the applicable live smoke tests.
- Document unresolved release blockers.

Deployment does not authorize npm publication or release tagging.

## 9. Technology Requirements

Preserve the existing monorepo architecture.

- Vite+ development toolchain.
- Existing Node.js and package manager configuration.
- Varlock application environment configuration.
- React/TypeScript frontend.
- Fastify backend.
- Existing SDK and provider adapters.
- Existing storage abstraction.
- Existing MySQL, PostgreSQL, and SQLite compatibility.
- Existing Drizzle and Prisma integrations.
- Docker-based VPS deployment.

Use workspace dependencies during development.

The playground and benchmarking tools remain private workspace packages with no independent public release version.

Do not change the SDK version merely because these tools are deployed.

## 10. Documentation Updates

Update active documentation to describe the actual v0.2.0 implementation.

Cover:

- Installation and configuration.
- Supported providers.
- Official receipt verification.
- Input detection and validation.
- Verification result contract.
- Detailed error codes.
- Amount tolerance configuration.
- Database adapters.
- Idempotency.
- Public synthetic playground.
- Private Live Verification Playground.
- Benchmarking.
- Seeded administrator authentication.
- Local deployment.
- VPS deployment.
- Browser sandbox requirements.
- Troubleshooting.
- Fresh-install and upgrade restrictions.

Preserve historical release documentation.

Clearly distinguish implemented features, validated features, pending work, and unsupported behavior.

Do not claim v0.2.0 is published until actual publication has occurred.

## 11. Deployment Feedback and Findings

Maintain a detailed deployment and validation report.

Suggested path:

`docs/development/reports/v0.2.0-vps-validation.md`

Record:

- VPS environment.
- Deployment steps.
- Installation difficulties.
- Browser startup behavior.
- Provider retrieval issues.
- SDK integration problems.
- Inaccurate or unclear error messages.
- Performance bottlenecks.
- Unexpected resource consumption.
- Security issues.
- Documentation gaps.
- Suggested improvements.

For each finding, record:

1. Observation.
2. Reproduction steps.
3. Supporting evidence.
4. Impact and severity.
5. Proposed fix.
6. Resolution status.

Separate confirmed problems from hypotheses.

Do not publish sensitive information.

## 12. Implementation Sequence

### Phase 1 — Audit

Inspect the repository, current v0.2.0 implementation, existing GitHub Pages site, and VPS.

Document deployment risks and missing prerequisites.

### Phase 2 — Public Playground

Implement and validate the static synthetic playground.

Integrate it with the existing GitHub Pages documentation.

### Phase 3 — Private Portal

Implement seeded administrator authentication, protected sessions, and the shared dashboard.

### Phase 4 — Live Verification

Connect the existing SDK and providers.

Complete expected-payment configuration, evidence submission, history, and diagnostics.

### Phase 5 — Benchmarking

Implement controlled benchmark execution, measurements, and reporting.

### Phase 6 — VPS Deployment

Deploy isolated application services.

Configure HTTPS, persistence, resource limits, health checks, and operational safeguards.

Validate that unrelated services remain unaffected.

### Phase 7 — Real-Provider Validation

Run authorized, low-volume CBE and Telebirr smoke tests.

Record actual findings and limitations.

### Phase 8 — Documentation and Reporting

Update public documentation and publish reviewed benchmark summaries.

Complete deployment and findings reports.

### Phase 9 — Release Readiness Assessment

Review outstanding blockers and recommend whether the v0.2.0 fresh-install release is ready for approval.

Do not automatically publish it.

## 13. Acceptance Criteria

The deployment is complete when:

- Documentation remains publicly hosted on GitHub Pages.
- The public synthetic playground works without VPS dependencies or real bank calls.
- The private admin portal is accessible through HTTPS.
- One seeded administrator account can securely log in.
- Signup and mandatory 2FA are absent.
- Live Verification uses the actual SDK and provider adapters.
- Benchmarking can execute controlled synthetic workloads.
- Verification results report precise technical diagnostics.
- Benchmark measurements include environment specifications.
- Existing VPS applications remain unaffected.
- Active documentation reflects implemented v0.2.0 behavior.
- All performed tests are supported by actual evidence.
- Uncompleted live tests are clearly recorded as pending.
- Deployment findings and operational instructions are documented.

## 14. Final Deliverables

Provide:

1. Public documentation and synthetic playground URLs.
2. Private VPS administrator portal URL.
3. Secure admin initialization and password rotation instructions.
4. Live Verification and Benchmarking sections.
5. Local and VPS deployment instructions.
6. Docker configuration and operational runbook.
7. Benchmark reports and specifications.
8. Updated v0.2.0 documentation.
9. VPS validation and findings report.
10. Completed test results and unresolved limitations.
11. Rollback and recovery instructions.
12. Release readiness recommendation.

**Do not include plaintext passwords, private credentials, real customer SMS contents, or sensitive banking information in these deliverables.**

---

## Final Instructions to the AI Coding Agent

Implement this deployment plan using our existing repository and infrastructure.

Inspect before modifying. Reuse existing code. Preserve working security and verification behavior.

Keep the public playground static and synthetic.

Keep live verification and benchmark execution protected behind the seeded administrator login on the VPS.

Do not disrupt the existing Bingo platform or unrelated services.

Do not perform load testing against real provider infrastructure.

Document your actual observations, problems, measurements, and recommendations throughout the work.

Do not publish the SDK or approve its release without explicit authorization.

**Final goal:** Deliver a secure public demonstration and private testing environment that allows us to validate Payment Verifier v0.2.0, evaluate its real deployment behavior, and improve the library using evidence gathered from a controlled VPS deployment.

Recommended execution: Give this complete plan to your coding agent as one coordinated initiative, with the phases implemented and tested sequentially. The playground and benchmarks do not need separate npm releases; the SDK remains the only versioned product.
