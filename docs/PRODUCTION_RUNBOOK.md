# KickIt production runbook

This runbook covers the off-chain, non-real-money KickIt economy. A release is not approved merely because the application builds; every launch gate below must have dated evidence from staging.

## Required managed services

- PostgreSQL 16 with TLS, point-in-time recovery, encrypted storage, automated daily backups, and a separate least-privilege application user.
- Redis 7 with TLS, authentication, persistence appropriate to the provider, and no public network exposure.
- Resend (or the configured compatible email API) with a verified sending domain, SPF, DKIM, and DMARC.
- A sports-data provider reached over HTTPS. Provider IDs must map to `CardTemplate.realWorldPlayerId`.
- Centralized JSON log collection and a Prometheus-compatible scraper for `/api/metrics` using `Authorization: Bearer $METRICS_TOKEN`.

Secrets belong in the deployment platform's secret manager. Never commit `.env`, database URLs, API keys, JWT secrets, audit HMAC secrets, or metrics tokens.
The production `DATABASE_URL` must explicitly set `sslmode=require`, `verify-ca`, or preferably `verify-full`; startup rejects an unencrypted database URL.

## Deploy

1. Create an immutable release from a reviewed commit whose CI security gates pass.
2. Back up PostgreSQL and record the backup identifier.
3. Run the server Dockerfile's `migration` target as a one-off release job; it executes `prisma migrate deploy`. Do not run `prisma migrate dev` in production.
   For the first release containing the economy ledger, pause economy writes from the old application before migration and keep them paused until the ledger-aware server is healthy. This prevents an old instance changing balances after the one-time opening-balance snapshot.
4. Deploy the server image first. Require `/api/health/live` and `/api/health/ready` to pass before receiving traffic.
5. Deploy the client image with `KICKIT_API_URL` set to the internal server origin.
6. Smoke-test registration, email verification, login, pack replay with the same idempotency key, marketplace buy, logout, and password reset.
7. Observe errors, latency, database saturation, Redis availability, and scheduler metrics for at least 15 minutes before completing the rollout.

Run the deployed authenticated acceptance gate with a dedicated, verified staging account. It intentionally opens exactly one affordable coin pack and therefore must never use a production account:

`ACCEPTANCE_API_URL=https://staging.example/api ACCEPTANCE_ORIGIN=https://staging.example ACCEPTANCE_EMAIL=... ACCEPTANCE_PASSWORD=... ACCEPTANCE_CONFIRM=I_UNDERSTAND_THIS_OPENS_ONE_PACK npm run test:staging`

Retain its JSON output with the release evidence. The gate verifies liveness/readiness, production cookie flags, authentication, concurrent idempotent pack opening with one debit, and immediate logout revocation.

Run the repeatable smoke-load gate against staging with `LOAD_TARGET=https://staging.example/api/health/ready LOAD_DURATION_MS=60000 LOAD_CONCURRENCY=50 npm run load:smoke`. This lightweight gate must show <=1% errors and p95 <=500 ms. Follow it with a representative authenticated journey test before launch; health-check throughput alone is not a capacity claim.

Use rolling or blue/green deployment with at least two server instances. The scheduler lease and serializable transactions protect shared work, while Redis provides distributed throttling.

## Backup and restore drill

At least monthly, restore the newest production backup into an isolated account/project. Never restore over production during a drill.

1. Record the source backup ID and its timestamp.
   Immediately before the backup, capture a read-only comparison manifest with `npm run backup:snapshot > kickit-backup-snapshot.json`; store it with the backup evidence, not in Git.
2. Restore into a newly created PostgreSQL instance with no public access.
3. Run `npx prisma migrate status`; it must report all migrations applied.
4. Run `RESTORE_SNAPSHOT_FILE=../kickit-backup-snapshot.json npm run restore:verify` against the isolated restore. It requires exact per-model row counts, identical applied migration names/checksums, validated foreign keys, and a continuous economy ledger.
5. Run a read-only application smoke test against the isolated restore.
6. Record recovery point objective (RPO) and recovery time objective (RTO). Launch targets: RPO <= 24 hours and RTO <= 4 hours; tighten these after traffic justifies it.
7. Destroy the isolated restore and its copied secrets after evidence is retained.

## Alerts

Page the on-call operator for:

- readiness failing for 2 consecutive minutes;
- HTTP 5xx responses above 2% for 5 minutes or a sudden authentication failure spike;
- p95 API latency above 1 second for 10 minutes;
- any `kickit_gameweek_scheduler_failures_total` increase;
- `time() - kickit_gameweek_scheduler_last_success_timestamp_seconds > 180` for 2 minutes;
- no successful settlement within the expected gameweek window, using `kickit_gameweek_last_settlement_timestamp_seconds` and the configured schedule;
- PostgreSQL connections above 80%, storage above 80%, replication lag, or backup failure;
- Redis unavailable, memory above 80%, or evictions;
- sports ingestion coverage below `SPORTS_MIN_COVERAGE_PERCENT`;
- unusual pack-opening, currency-transfer, password-reset, or security-event volume.
- sustained increases in `kickit_body_parser_rejections_total`, which can indicate malformed-input probing or an incorrect proxy body-size policy;
- any `kickit_email_delivery_failures_total` increase; recovery endpoints intentionally return a generic success response, so operators must detect provider failures through this alert;
- any `kickit_security_audit_write_failures_total` or `kickit_security_maintenance_failures_total` increase.

Alerts must route to a named owner and a tested notification channel. Dashboards without alerts do not satisfy this gate.

## Incident response

1. Declare severity and assign an incident commander.
2. Preserve logs and security events; do not log or copy raw credentials/tokens.
3. For credential exposure, rotate the affected provider key. For JWT-secret exposure, rotate the secret and revoke all sessions.
4. For economy-integrity concerns, disable the affected write path or place the API in maintenance mode before investigating balances.
5. Reconcile pack openings, listings, card ownership, and balance changes from database records before restoring writes.
   Currency reconciliation uses the append-only `economy_transactions` table: every initial grant, pack debit, marketplace buyer debit, and seller credit records its resulting balance and immutable business reference. Any missing counterpart or balance discontinuity is an incident until explained.
   Run `npm run economy:reconcile` with a read-only production database credential. Retain the JSON report; it verifies continuous per-currency balance chains and pack/listing references without modifying data.
6. Communicate user impact and resolution. Complete a blameless post-incident review with tracked corrective actions.

## Rollback

Application images are rolled back by immutable version. Database migrations in this repository are forward-only. If a migration causes trouble, stop the rollout and deploy a reviewed forward-fix migration; do not manually edit production schema or delete migration history.

Before rollback, confirm the previous application version can read the migrated schema. If it cannot, keep traffic on the new compatible version while applying the forward fix.

## Launch approval evidence

- CI build, test, migration, and dependency-audit checks are green.
- Both images have been built and scanned for critical/high findings.
- A fresh staging database has successfully applied the complete migration chain.
- Restore drill, rollback drill, and load test reports are attached to the release.
- Production secrets are unique, stored outside Git, and rotation owners are recorded.
- Monitoring dashboards and alert delivery have been exercised.
- Terms, privacy notice, age/region requirements, licensed player imagery/data, and customer-support contact have owner approval.
- The economy is explicitly non-cash, non-withdrawable, and off-chain; any future real-money feature requires a new legal and security review.
