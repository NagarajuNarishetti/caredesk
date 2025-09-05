### Architecture

Components
- Next.js client (`client/`) – UI, role‑aware views, Axios API client.
- Express API (`server/`) – REST endpoints in `server/routes/*`.
- PostgreSQL – relational data store for tickets/users/orgs.
- MinIO – object storage for attachments.
- Redis – agent assignment queues (RR/LAA).
- RabbitMQ – async workers for notifications/reports.
- Socket.IO – real‑time eventing for comments and ticket updates.

Request flow (ticket read/update)
1) Client requests `GET /tickets/:id?userId=...`.
2) API verifies viewer (Keycloak flow or explicit `userId/assignedTo`).
3) API joins related tables and enriches attachments with presigned URLs.
4) Client renders `TicketDetail` with conversation and preview.
5) Customer edits description → `PUT /tickets/:id?userId=...` → API checks permissions → updates Postgres → emits `ticket-updated`.

Ticket creation flow
1) `POST /tickets` inserts new row with generated `ticket_number`.
2) Auto‑assignment: check org settings → pick agent via Redis RR/LAA (or SQL fallback) → update ticket.
3) Publish `ticket_created` to RabbitMQ; worker delivers notifications.

Real‑time updates
- Socket rooms per ticket (`ticket_{id}`) to broadcast comments and updates.

Deployment view
- All backing services (Postgres, MongoDB, Redis, MinIO, RabbitMQ) can be launched with `docker/docker-compose.yml` for dev. API and client run as separate services.


