# Milestone 3 operations

Milestone 3 implements the server-owned weekly state machine:

`UPCOMING -> OPEN -> LOCKED -> SETTLING -> COMPLETED`

The scheduler runs every minute in UTC. It provisions the next gameweek, snapshots every valid active five-player lineup at lock time, ingests provider metrics at the end time, calculates fantasy points, settles immutable tournament entries, and rebuilds the Redis sorted-set leaderboard.

## Deployment

1. Configure the variables documented in `server/.env.example`. Production requires PostgreSQL, an HTTPS client origin, TLS Redis (`rediss://`), and a strong JWT secret.
2. Run `npx prisma migrate deploy` from `server` before starting the new release.
3. Assign `CardTemplate.realWorldPlayerId` values matching the chosen sports provider. Rows without a mapping are intentionally ignored.
4. Start the API. The next Monday 12:00 UTC gameweek is provisioned automatically.

## Sports provider contract

The API performs an HTTPS `GET` with `?gameweek=<number>`, `Authorization: Bearer <SPORTS_API_KEY>`, and a ten-second timeout. The response must be a JSON array no larger than 2 MiB or 5,000 rows. Every row must contain:

```json
{
  "realWorldPlayerId": 123,
  "minutesPlayed": 90,
  "goals": 1,
  "assists": 0,
  "yellowCards": 0,
  "redCards": 0,
  "ownGoals": 0,
  "penaltyMisses": 0,
  "cleanSheet": false,
  "saves": 0,
  "penaltySaves": 0,
  "updatedAt": "2026-08-04T12:00:00Z"
}
```

Older or duplicate provider observations are ignored. A failed settlement receives a 15-minute lease and is retried safely; only one API replica can claim a settlement at a time.

## Read endpoints

- `GET /api/gameweeks/current`
- `GET /api/gameweeks/:id/leaderboard?page=1&limit=50`

Both require an authenticated HttpOnly-cookie session. Leaderboards use Redis when healthy and transparently fall back to indexed PostgreSQL reads.
