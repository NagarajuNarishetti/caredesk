### Next.js – Frontend portal

What it does
- Renders customer, agent, and admin experiences based on role.
- Talks to the backend via `client/lib/api.js` (Axios with Keycloak token interceptor).
- Real‑time updates via Socket.IO and collaborative editing for docs.

Where it lives
- Pages: `client/pages/` (e.g., `media.js`, `users.js`, `organizations.js`).
- Global app wrapper: `client/pages/_app.js`.
- Components: `client/components/` (e.g., `TicketDetail.js`, `Navbar.js`).
- Styles: `client/styles/` and Tailwind config.

Key implementation details
- API helper (`client/lib/api.js`) injects the Keycloak token into the `Authorization` header for every request. Errors are logged centrally.
- Ticket detail UX (`client/components/TicketDetail.js`):
  - Fetch single ticket: `GET /tickets/:id?userId=...` or `?assignedTo=...`.
  - Customer can edit description using `PUT /tickets/:id?userId=...`.
  - Replies/notes created via `POST /ticket-comments/ticket/:id`.
  - Optimistic refresh by re‑querying the ticket after mutations.
- Real‑time: the server emits `ticket-updated` and `new-ticket-comment` events; the client can subscribe to reflect updates live.

Role‑based rendering
- The UI shows edit controls only when the current viewer is authorized (e.g., description edit button rendered if `details.customer_id === viewerId`).

How this helps
- Next.js provides fast developer experience, routing, and SSR/SSG flexibility while keeping the app a straightforward SPA for our case.


