### MinIO / Ceph – Object storage for attachments

What it stores
- Ticket attachments uploaded by users (images, videos, documents).

Where to look
- Config/client: `server/config/minio.js`.
- Upload handling: `server/routes/media.js` and ticket view enrichment in `server/routes/tickets.js`.
- Files (local dev cache): `server/uploads/`.

How it works here
- When showing a ticket, the backend generates presigned URLs with `minioClient.presignedGetObject(...)` so the frontend can preview files without exposing credentials.
- Uploads store only metadata in Postgres; the actual bytes live in MinIO.

How this helps
- Scalable, S3‑compatible storage keeps the database small and supports large files and streaming previews.


