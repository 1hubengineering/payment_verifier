# Public Pages and private VPS validation

## Outcome and scope

Deploy a browser-only synthetic playground and reviewed benchmark observations alongside published docs. Deploy the SDK 0.2.0 candidate in an isolated, authenticated VPS portal for official verification and controlled synthetic benchmarking. Validate fresh installations and retain the separate SDK release decision.

## Evidence and decisions

- Main runs the GitHub Pages environment, which only permits that branch. Published guides and API declarations describe 0.1.1. Candidate documentation must identify its source version separately.
- The 0.2.0 feature branch and uncommitted working files already contain the new SDK contract, hardening, and private tool foundations from plans 017–020. Preserve unrelated drafts and the separate release worktree.
- The VPS has four vCPUs, about 7.75 GiB RAM, and about 58 GiB available at audit. Bingo owns public 80/443. Use its existing SSH access with a verifier-only loopback HTTPS listener and persistent local CA. Use fresh verifier-owned SQLite files.
- The public interface uses SDK input detection and comparison with browser-memory mock fixtures, claims, and replay. Benchmark traffic stays synthetic.

## Implementation and checks

- [x] Audit the source, Pages configuration, published release status and VPS.
- [x] Build and browser-test Pages playground and candidate docs, including offline provider isolation.
- [x] Add seeded admin credentials, password rotation, durable sessions, origin enforcement, and protected API/UI coverage.
- [x] Connect the existing live verification path and controlled benchmark runner to the portal. Verify timeout, replay, cancel, history, and provider isolation.
- [x] Build and test the private Compose deployment, capture service health, TLS validation, browser sandbox checks, and unchanged Bingo state.
- [x] Run bounded synthetic workloads, review and publish sanitized summaries, and confirm Pages routes.
- [x] Run workspace acceptance and record what remains for the 0.2.0 fresh-install release.

## Handoff

Deployment and validated observations are tracked in [the VPS report](../reports/v0.2.0-vps-validation.md). The authorized VPS smoke and retest each made one lookup per provider. Both rounds timed out. The operator opened both receipts in a browser on Ethio Telecom mobile data. CBE also opened on other tested networks; the Telebirr receipt opened only on Ethio Telecom in those browser tests. Live SDK extraction remains unvalidated. Existing 0.1.1 stores require a separately tested claim-preserving cutover.
