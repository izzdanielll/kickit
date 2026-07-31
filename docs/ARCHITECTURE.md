# kickIt architecture

The API uses feature-based MVC boundaries:

```text
HTTP request
  -> middleware (security headers, origin check, request logging)
  -> guard (JWT authentication)
  -> DTO (input validation and normalization)
  -> controller (routing only)
  -> service (business rules and transaction boundary)
  -> Prisma model/database
```

Each backend feature lives under `server/src/<feature>`:

- `*.controller.ts`: routes and HTTP concerns
- `dto/`: request contracts and validation
- `*.service.ts`: application/business logic
- `*.module.ts`: dependency wiring

Cross-feature code lives under `server/src/common`. Database access belongs in
services and must always scope private resources by the authenticated user's ID.

## Debugging checklist

1. Find the route in the feature controller.
2. Check its DTO when a request returns `400`.
3. Check the JWT guard/strategy when it returns `401`.
4. Follow the matching service method for business rules and Prisma queries.
5. Use the HTTP log's method, URL, status, and duration to identify slow requests.

## Security rules

- Never return `passwordHash` or JWTs in JSON responses.
- Mutating routes must remain behind authentication and same-origin validation.
- Currency and ownership changes must be performed atomically in a transaction.
- List endpoints must remain paginated and capped.
- Production must fail closed if the database is unavailable.
- Generate a unique `JWT_SECRET` of at least 32 characters; never use the example.

After schema changes, create and apply a Prisma migration:

```powershell
npm.cmd run prisma:migrate -- --name add_query_indexes
```
