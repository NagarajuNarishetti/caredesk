### Keycloak – Authentication & Authorization

What it does
- Provides login, tokens, and role mapping per organization (tenant).
- Roles used: `orgAdmin`, `Agent`, `Customer`.

Where it’s configured
- Server middleware: `server/middleware/keycloak.js` (initialization), wired in `server/index.js`.
- Client uses the global `window.keycloak.token` when available (see `client/lib/api.js`).

How it’s used in code
- Every protected backend route expects a valid bearer token. In Express, the user info is read via `req.kauth.grant.access_token.content`.
- Example (tickets route): `server/routes/tickets.js`
  - Reads user id and role from Keycloak subject.
  - Joins with `organization_users` to determine org and role.
  - Applies role‑based access rules (e.g., customers can only update their tickets, agents only tickets assigned to them).

Shortcut (viewer) paths
- Some endpoints allow explicit `?userId=` or `?assignedTo=` for read/update when caller context is known (mirrors GET behavior). This supports customer description edits without full Keycloak context on the client.

How this helps
- Centralized auth reduces custom code and keeps multi‑tenant role checks consistent across endpoints.


