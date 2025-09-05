### Redis – Queues for agent assignment

What it does
- Maintains lightweight queues/lists of available agents for round‑robin assignment per organization.
- Also supports Least Active Assignment with quick counters.

Where to look
- Config/connection: `server/config/redis.js`.
- Auto‑assignment logic: `server/routes/tickets.js` in the `POST /tickets` handler.

How it works here
- When a ticket is created, we inspect org settings to choose RR (round‑robin) or LAA.
- For RR: we store an org‑scoped list of agent user ids, pop/rotate to pick the next agent, and push back.
- If Redis list is empty, we rebuild it from current agents in Postgres, then proceed.

How this helps
- Keeps assignment fast and fair without heavy SQL each time.


