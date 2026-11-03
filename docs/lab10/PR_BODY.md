ShopKZ lacked CI checks, a release artifact and production delivery measurements. This adds required quality/security/build jobs, a checksummed runtime artifact, a GitHub REST DORA collector with explicit missing-data handling, and a Kazakh release/rollback plan.

The full checkout regression exposed acceptance of unknown payment methods and invalid/expired card dates; server validation now rejects those requests before stock or orders change. body-parser is overridden to patched 1.20.9 while Express remains on v4.

Validation: 77 Jest tests, 8 system tests, 7 DORA metric tests; ESLint, syntax checks, runtime build/checksums and Trivy HIGH/CRITICAL gate passed locally. Chromium cannot launch in the local restricted environment (socket EPERM), so the nine E2E tests must pass in Actions before merge.

API evidence currently has no production deployments. The dashboard shows observed 0/day and unknown lead time/CFR/recovery; it does not fabricate team rankings. Apply .github/branch-protection.json after checks are registered. Deployment logging and a complete incident register are required for future DORA measurements.
