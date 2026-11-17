# Standards and accepted policy (2026-11-08)

User accepted safe upgrade, verifiable recovery, forward fixes after successful use and bounded
downgrade support. These directions supersede the prior request to accept a patch-version exception.
They do not grant unconditional publication approval or prove implementation readiness.

## Official references inspected in the preceding conversation

- [Semantic Versioning 2.0.0](https://semver.org/): clauses 1, 6, 7 and 8 define the declared public
  API and version increments. Internal database changes and inability of an old binary to read
  future data are not themselves an automatic major-version rule. Public export/integration
  contracts still require explicit assessment. Do not assert that all current dev work is a patch.
- [Microsoft Edge enterprise rollback](https://learn.microsoft.com/en-us/deployedge/edge-learnmore-rollback):
  temporary rollback, security caveats, version-stamped profile snapshots, default retention of
  three, and possible data loss. This is evidence of bounded support, not a requirement to copy
  the entire Edge mechanism into this local application.
- [Windows recovery options](https://support.microsoft.com/en-us/windows/experience/backup-recovery/recovery-options-in-windows):
  returning to a previous version normally has a ten-day window and does not preserve all
  post-upgrade app/driver/settings changes. Product-specific, not a universal required duration.
- [AWS rollback safety](https://aws.amazon.com/builders-library/ensuring-rollback-safety-during-deployments/):
  prepare readers before enabling new writers, bake periods and upgrade/downgrade tests. V3 can
  return to compatible V2, not arbitrary V1. Distributed fleet control differs from desktop users
  skipping versions; no blanket two-phase deployment requirement is adopted here.
- [PostgreSQL upgrades](https://www.postgresql.org/docs/current/upgrading.html): a product-specific
  same-major storage compatibility promise and checks against incompatible data directories;
  distinguish such explicit contracts from generic desktop semver.
- [SQLite atomic commit](https://www.sqlite.org/atomiccommit.html): transaction all-or-nothing
  behavior within documented filesystem/configuration assumptions; WAL uses a different
  mechanism. DB transactions do not make config/files/installer operations one atomic unit.

The Microsoft, AWS, PostgreSQL, SQLite and SemVer pages were retrieved successfully. Google
support/policy retrieval timed out; no Google-specific claim is used as verified evidence.

## Applying the direction here

- Safety gates apply regardless of marketing version: verified checkpoint, failure handling,
  interruption evidence, data-preservation tests and final-artifact acceptance.
- Backup only what the actual upgrade changes or requires for coherent recovery. Do not turn
  migration hardening into a generic full-profile backup product, or label a SQLite file as one.
- Successful-use problems prefer a forward fix that preserves new data. Controlled restoration
  keeps the current state and admits that an old checkpoint lacks newer records.
- New versions should reject unknown future schemas, but an already-shipped old binary cannot
  gain this guard retroactively. No arbitrary downgrade or hidden rollback of user changes.
- Evidence is graded: static inspection, synthetic DB test, native packaged test and real installer
  acceptance are separate. A dry-run, artifact build or old green test is not full release acceptance.
