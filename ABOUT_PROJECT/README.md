### CareDesk – Multi‑Tenant Support Ticket System

This documentation explains how the project works, how each technology is used in this codebase, and the overall architecture and workflows.

Contents
- Next.js frontend: see `ABOUT_PROJECT/Nextjs.md`
- Keycloak auth and roles: see `ABOUT_PROJECT/Keycloak.md`
- PostgreSQL data model: see `ABOUT_PROJECT/PostgreSQL.md`
- Redis queues: see `ABOUT_PROJECT/Redis.md`
- RabbitMQ background jobs: see `ABOUT_PROJECT/RabbitMQ.md`
- MinIO object storage: see `ABOUT_PROJECT/MinIO.md`
- Architecture: see `ABOUT_PROJECT/Architecture.md`
- System design & scalability: see `ABOUT_PROJECT/System-Design.md`

Quick orientation
- Frontend (Next.js): `client/`
- Backend (Express): `server/`
- Key routes: `server/routes/`
- Config: `server/config/`
- SQL schema and migrations: `server/sql/`
- File uploads: `server/uploads/`

Local development
1) Start backend: from `server/` run `npm run dev` (see `server/index.js`).
2) Start frontend: from `client/` run `npm run dev` (Next.js on port 3000).
3) Services required: PostgreSQL, MongoDB, MinIO, Redis, and RabbitMQ. See `docker/docker-compose.yml` for a ready setup.

Key user roles (via Keycloak)
- Org Admin: manages org, agents, and full ticket visibility.
- Agent: works tickets assigned to them.
- Customer: creates tickets and follows up. 

End‑to‑end flow (high level)
1) Customer logs in (Keycloak), submits a ticket (Next.js → Express → PostgreSQL).
2) Backend may auto‑assign to an agent (Redis round‑robin or least‑active algorithm).
3) Agent and customer exchange comments; attachments go to MinIO; metadata in Postgres.
4) Notifications and analytics jobs are queued through RabbitMQ.


