# Deployment readiness for receipt providers

## Outcome and evidence

Users can check provider connectivity and Chromium from the actual Node
runtime without a receipt or database. The deployment guide covers direct
routing, the existing Telebirr Unix socket, and a separate worker for hosts
without the required runtime or egress. The published 0.3.0 SDK provides the functions used by this private CLI.
The archived VPS report describes the separate 0.2.0 deployment. Managed platform support is
based on documented capabilities until tested in an actual deployment.

## Steps and validation

- [x] Share the HTTPS transport policy with a receipt-free TLS preflight and
      use the adapter's sandboxed Chromium path with a synthetic document.
- [x] Add a diagnostic command and cover default offline behavior, transport
      results, TLS failure, and browser configuration with local tests.
- [x] Document local use, hosted runtimes, provider-only SSH, and the existing
      durable worker. Check examples and run `pnpm verify`.

## Decisions

Network checks are opt-in and stop at TLS. They never send an HTTP request,
start a receipt lookup, or persist a test claim. A successful check cannot
prove that the provider will serve a particular receipt. This branch adds the private workspace command and deployment documentation.

## Validation evidence

Focused tests cover local CLI behavior, invalid provider and socket input,
certificate errors and timeouts. The CLI rendered synthetic CBE content in a
sandboxed container with networking disabled. A local TLS fixture on a Unix
socket completed a verified handshake with zero application bytes. A missing
socket produced the documented retryable transport diagnostic. No provider
network or receipt requests were made during development.

The deployment guide distinguishes the VPS evidence from the managed-host
configurations that remain untested.

The branch is based on the published 0.3.0 source. The offline CLI checks
passed for Telebirr and sandboxed CBE, and invalid arguments exited with code 2. Local verification covered 363 workspace cases, 40 checkout cases,
297 adapter contract cases, and 11 frozen reference cases.
