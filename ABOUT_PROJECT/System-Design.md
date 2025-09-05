### System Design & Scalability

Core requirements
- Multi‑tenant isolation by organization.
- Role‑based access: orgAdmin, Agent, Customer.
- Ticket lifecycle with comments, attachments, and history.
- Real‑time collaboration and notifications.

Data model notes
- Org membership in `organization_users` ties a Keycloak user to a tenant and role.
- Tickets reference both `customer_id` and `assigned_agent_id` for clear ownership and routing.

Scaling strategies
- API stateless behind a load balancer; sticky sessions not required.
- PostgreSQL: use read replicas for reporting; partition large tables by organization or time if needed.
- Redis: per‑org keys for RR queues; TTL and rebuild logic protect from drift.
- RabbitMQ: separate queues for `ticket_created`, `email`, and `reporting`; scale workers horizontally.
- MinIO: deploy with erasure coding / distributed mode for durability; use presigned URLs to offload file serving.
- Caching: consider read‑through cache for ticket lists per org; invalidate on update events.

Security considerations
- All endpoints require bearer auth; shortcut viewer paths still verify that the viewer is the ticket customer or assigned agent.
- Object storage access is via presigned URLs with short expirations.

Observability
- Centralized logging for API/worker; metrics on queue depth, request latency, and DB load.

Failure handling
- If Redis queue is empty/unavailable, fall back to SQL query to pick an agent.
- If RabbitMQ is down, API continues (logs warnings) and retries can be handled by the worker on recovery.


