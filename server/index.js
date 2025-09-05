const express = require('express');
const http = require('http');
const cors = require('cors');
const session = require('express-session');
require('dotenv').config();

// MongoDB removed

// MinIO connection
const { initMinio } = require('./config/minio');
initMinio();

const pool = require('./config/db'); // PostgreSQL for user/media metadata
const { initKeycloak, memoryStore } = require('./middleware/keycloak');

const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server, {
  cors: {
    origin: ["http://localhost:3000", "http://localhost:3001"],
    methods: ["GET", "POST"]
  }
});

// Yjs WebSocket removed

// index.js
app.set('io', io);
app.use(cors());
app.use(express.json());
app.use(session({
  secret: 'someSecret',
  resave: false,
  saveUninitialized: true,
  store: memoryStore
}));

// Initialize Keycloak
const keycloak = initKeycloak();
app.use(keycloak.middleware());

// Import routes
const usersRoutes = require('./routes/users');
const mediaRoutes = require('./routes/media');
const ticketsRoutes = require('./routes/tickets');
const ticketCommentsRoutes = require('./routes/ticketComments');

const orgInvitesRoutes = require('./routes/orgInvites');
const organizationsRoutes = require('./routes/organizations');



app.use('/users', usersRoutes);
app.use('/media', mediaRoutes);
app.use('/tickets', ticketsRoutes);
app.use('/ticket-comments', ticketCommentsRoutes);

app.use('/uploads', express.static('uploads'));
app.use('/org-invites', orgInvitesRoutes);
app.use('/organizations', organizationsRoutes);



// Socket.IO logic
io.on('connection', (socket) => {
  console.log('🔗 User connected:', socket.id);

  // Ticket-related socket handlers
  socket.on('join-ticket', (ticketId) => {
    socket.join(`ticket_${ticketId}`);
    console.log(`🎫 User ${socket.id} joined ticket room: ${ticketId}`);
  });

  socket.on('new-ticket-comment', ({ ticketId, comment }) => {
    console.log('💬 Broadcasting ticket comment to room:', ticketId);
    socket.to(`ticket_${ticketId}`).emit('new-ticket-comment', comment);
  });

  socket.on('ticket-updated', ({ ticketId, ticket }) => {
    console.log('📝 Broadcasting ticket update to room:', ticketId);
    socket.to(`ticket_${ticketId}`).emit('ticket-updated', ticket);
  });

  // Removed legacy media comment/annotation handlers

  socket.on('disconnect', () => {
    console.log('❌ User disconnected:', socket.id);
  });
});

// Basic routes
app.get('/', (req, res) => {
  res.json({
    message: "CareDesk API Server",
    status: "Running",
    features: ["Multi-tenant Support Ticket System", "Real-time Comments", "Role-based Access Control", "Socket.IO"]
  });
});

app.get('/db-test', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({
      postgresql: result.rows[0],
      socketio: 'Ready ✅'
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('DB query failed');
  }
});



const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔌 Socket.IO ready for real-time features`);

});
