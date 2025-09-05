require('dotenv').config({ path: __dirname + '/env.txt' });
const { getChannel } = require('./config/rabbitmq');

async function start() {
  const ch = await getChannel();
  const queue = 'ticket_created';
  await ch.assertQueue(queue, { durable: true });
  console.log('Worker listening on', queue);
  ch.consume(queue, async (msg) => {
    if (!msg) return;
    try {
      const data = JSON.parse(msg.content.toString());
      // Placeholder: send emails, generate reports, etc.
      console.log('ticket_created job received:', {
        ticketId: data.ticket?.id,
        org: data.organization_id,
      });
      ch.ack(msg);
    } catch (e) {
      console.error('Worker error:', e);
      ch.nack(msg, false, false); // drop or dead-letter
    }
  });
}

start().catch((e) => {
  console.error('Worker failed to start:', e);
  process.exit(1);
});


