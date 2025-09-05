### PostgreSQL – Primary data store

What it stores
- Users, organizations, organization membership and roles.
- Tickets, comments, attachments metadata, history, priorities, categories.

Where to look
- Connection: `server/config/db.js`.
- Schema & migrations: `server/sql/` (`schema.sql`, `migrate_to_tickets.sql`, `add_document_content.sql`).
- Ticket routes: `server/routes/tickets.js` and comments: `server/routes/ticketComments.js`.

Key tables (representative)
- `tickets`: core entity with `organization_id`, `customer_id`, `assigned_agent_id`, `status`, timestamps.
- `ticket_comments`: threaded conversation with `user_id` and `created_at`.
- `ticket_attachments`: metadata for MinIO objects.
- `ticket_history`: audit trail for actions and field changes.

Typical flows
- Create ticket: `POST /tickets` inserts a row, generates `ticket_number`, and may auto‑assign agent.
- Update ticket: `PUT /tickets/:id` updates status/description and logs to `ticket_history`.
- Read ticket: `GET /tickets/:id` joins user names, priorities, categories, and attachments for a rich view.

How this helps
- Strong relational guarantees and SQL flexibility make reporting and complex filters straightforward.


