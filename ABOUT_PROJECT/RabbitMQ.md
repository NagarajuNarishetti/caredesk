### RabbitMQ – Background jobs & notifications

What it does
- Decouples slow or non‑critical work (emails, analytics, notifications) from request/response paths.

Where to look
- Config: `server/config/rabbitmq.js`.
- Usage example: in `POST /tickets` we `publish('ticket_created', { ... })` after insert.

How it works here
- The API publishes events such as `ticket_created`.
- A worker process (`server/worker.js`) consumes messages for tasks like sending emails or generating reports.

How this helps
- Keeps the API responsive and resilient while enabling reliable processing of asynchronous tasks.


