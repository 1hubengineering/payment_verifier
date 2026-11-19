# CBE live receipt rendering

## Outcome and scope

Fix the CBE receipt path exercised by the authorized VPS smoke. Keep provider
transport, Chromium confinement, receipt comparison, and claim rules intact.
Use disposable synthetic evidence for regression testing and an isolated VPS
smoke to validate the existing authorized receipt.

## Evidence

The 120-second probe received an HTTPS body in 1.30 seconds and loaded the
document in sandboxed Chromium by 4.08 seconds. The renderer then waited for
the exact transaction heading until it returned `RECEIPT_RENDER_TIMEOUT`.
The operator opened the receipt in ordinary browsers on several networks.
The VPS received a client-rendered Nuxt shell. Its official first-party
public JSON endpoint returned HTTP 200 and transaction fields. Synthetic
fixtures reproduce that shell and payload shape without provider data.

## Steps and validation

- [x] Inspect only structural indicators from one authorized response and
      reproduce the issue with an equivalent synthetic fixture.
- [x] Correct the observable failure while preserving the SDK's trust and
      browser isolation boundaries.
- [x] Run the CBE regression and full workspace checks. Deploy the fixed
      portal image in the existing isolated Compose project and record one
      bounded smoke outcome, with rollback to the prior image available.

## Decisions and handoff

The first image passed the VPS HTTPS health check and received an HTTP 401 on
the CBE data request. The browser follow-up below resolved receipt retrieval.
See the [VPS validation report](../reports/v0.2.0-vps-validation.md#proof-of-concept-comparison-and-browser-fix)
for the production smoke test and rollback details.

## Working proof-of-concept comparison

The Windows proof of concept matched the frozen reference and loads the official
receipt as a regular browser page. A new browser context reproduced it with
HTTP 200 on the workstation and the VPS, without cookies or an authorization
header. The direct SDK client returned HTTP 401 on the same workstation. The
constrained browser diagnostic then fetched JSON from the fetched official
page origin with scripts disabled, omitting credentials and using normal CORS.

- [x] Reproduce and distinguish the proof of concept from the direct client.
- [x] Port the browser request with one fixed data endpoint, validated DNS
      pinning, disabled provider scripts and assets, decoded byte bounds, and
      the shared deadline.
- [x] Run the regression and workspace checks, verify the authorized receipt on
      the new VPS build, and update the deployment record.
