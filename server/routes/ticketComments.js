const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { validate: isUuid } = require('uuid');

// GET /ticket/:ticketId - Get comments for a specific ticket
router.get('/ticket/:ticketId', async (req, res) => {
  try {
    const { ticketId } = req.params;
    console.log('GET /ticket-comments/ticket/:ticketId called with ticketId:', ticketId);

    // Check if user is authenticated
    if (!req.kauth || !req.kauth.grant || !req.kauth.grant.access_token) {
      console.log('❌ No authentication found for ticket comments');
      return res.status(401).json({ error: 'Authentication required' });
    }

    const user = req.kauth.grant.access_token.content;
    const userKeycloakId = user.sub;
    console.log('User Keycloak ID for comments:', userKeycloakId);

    // Get user's organization and role
    const userResult = await pool.query(`
      SELECT u.id, ou.organization_id, ou.role
      FROM users u
      JOIN organization_users ou ON u.id = ou.user_id
      WHERE u.keycloak_id = $1
    `, [userKeycloakId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userData = userResult.rows[0];

    // Check if user can access this ticket
    const ticketResult = await pool.query(`
      SELECT * FROM tickets 
      WHERE id = $1 AND organization_id = $2
    `, [ticketId, userData.organization_id]);

    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const ticket = ticketResult.rows[0];

    // Role-based access control
    if (userData.role === 'Customer' && ticket.customer_id !== userData.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (userData.role === 'Agent' && ticket.assigned_agent_id !== userData.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get comments
    const result = await pool.query(`
      SELECT 
        tc.*,
        u.username,
        u.email,
        u.first_name,
        u.last_name
      FROM ticket_comments tc
      JOIN users u ON tc.user_id = u.id
      WHERE tc.ticket_id = $1
      ORDER BY tc.created_at ASC
    `, [ticketId]);

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching ticket comments:', err);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

// POST /ticket/:ticketId - Add a comment to a ticket
router.post('/ticket/:ticketId', async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { content, is_internal = false } = req.body;
    const { assignedTo, userId } = req.query || {};
    console.log('POST /ticket-comments/ticket/:ticketId called with ticketId:', ticketId);

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Comment content is required' });
    }

    // Optional viewer-context path: allow explicit viewer id when Keycloak context is unavailable
    if (assignedTo || userId) {
      const viewerId = assignedTo || userId;
      const base = await pool.query('SELECT * FROM tickets WHERE id = $1', [ticketId]);
      if (base.rows.length === 0) {
        return res.status(404).json({ error: 'Ticket not found' });
      }
      const ticket = base.rows[0];
      // Ensure viewer is customer or assigned agent
      if (!(ticket.customer_id === viewerId || ticket.assigned_agent_id === viewerId)) {
        return res.status(403).json({ error: 'Access denied' });
      }
      // Prevent customers from posting internal comments
      const roleRes = await pool.query(
        'SELECT role FROM organization_users WHERE user_id = $1 AND organization_id = $2 LIMIT 1',
        [viewerId, ticket.organization_id]
      );
      const role = roleRes.rows[0]?.role || 'Customer';
      if (is_internal && role === 'Customer') {
        return res.status(403).json({ error: 'Customers cannot make internal comments' });
      }
      const result = await pool.query(`
        INSERT INTO ticket_comments (ticket_id, user_id, content, is_internal)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `, [ticketId, viewerId, content.trim(), is_internal]);
      const commentResult = await pool.query(`
        SELECT 
          tc.*,
          u.username,
          u.email,
          u.first_name,
          u.last_name
        FROM ticket_comments tc
        JOIN users u ON tc.user_id = u.id
        WHERE tc.id = $1
      `, [result.rows[0].id]);
      const io = req.app.get('io');
      if (io) {
        io.to(`ticket_${ticketId}`).emit('new-ticket-comment', {
          comment: commentResult.rows[0],
          ticketId: ticketId
        });
      }
      return res.status(201).json(commentResult.rows[0]);
    }

    // Default path: Keycloak-authenticated flow
    if (!req.kauth || !req.kauth.grant || !req.kauth.grant.access_token) {
      console.log('❌ No authentication found for ticket comments POST');
      return res.status(401).json({ error: 'Authentication required' });
    }

    const user = req.kauth.grant.access_token.content;
    const userKeycloakId = user.sub;
    console.log('User Keycloak ID for POST comments:', userKeycloakId);

    // Get user's organization and role
    const userResult = await pool.query(`
      SELECT u.id, ou.organization_id, ou.role
      FROM users u
      JOIN organization_users ou ON u.id = ou.user_id
      WHERE u.keycloak_id = $1
    `, [userKeycloakId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userData = userResult.rows[0];

    // Check if user can access this ticket
    const ticketResult = await pool.query(`
      SELECT * FROM tickets 
      WHERE id = $1 AND organization_id = $2
    `, [ticketId, userData.organization_id]);

    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const ticket = ticketResult.rows[0];

    // Role-based access control
    if (userData.role === 'Customer' && ticket.customer_id !== userData.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (userData.role === 'Agent' && ticket.assigned_agent_id !== userData.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Only agents and admins can make internal comments
    if (is_internal && userData.role === 'Customer') {
      return res.status(403).json({ error: 'Customers cannot make internal comments' });
    }

    // Create comment
    const result = await pool.query(`
      INSERT INTO ticket_comments (ticket_id, user_id, content, is_internal)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [ticketId, userData.id, content.trim(), is_internal]);

    // Get the full comment with user info
    const commentResult = await pool.query(`
      SELECT 
        tc.*,
        u.username,
        u.email,
        u.first_name,
        u.last_name
      FROM ticket_comments tc
      JOIN users u ON tc.user_id = u.id
      WHERE tc.id = $1
    `, [result.rows[0].id]);

    // Notify via socket.io
    const io = req.app.get('io');
    if (io) {
      io.to(`ticket_${ticketId}`).emit('new-ticket-comment', {
        comment: commentResult.rows[0],
        ticketId: ticketId
      });
    }

    res.status(201).json(commentResult.rows[0]);
  } catch (err) {
    console.error('Error creating ticket comment:', err);
    res.status(500).json({ error: 'Failed to create comment' });
  }
});

// PUT /:commentId - Update a comment
router.put('/:commentId', async (req, res) => {
  try {
    const { commentId } = req.params;
    const { content } = req.body;
    const user = req.kauth.grant.access_token.content;
    const userKeycloakId = user.sub;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Comment content is required' });
    }

    // Get user's organization and role
    const userResult = await pool.query(`
      SELECT u.id, ou.organization_id, ou.role
      FROM users u
      JOIN organization_users ou ON u.id = ou.user_id
      WHERE u.keycloak_id = $1
    `, [userKeycloakId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userData = userResult.rows[0];

    // Get comment and check ownership
    const commentResult = await pool.query(`
      SELECT tc.*, t.organization_id
      FROM ticket_comments tc
      JOIN tickets t ON tc.ticket_id = t.id
      WHERE tc.id = $1
    `, [commentId]);

    if (commentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const comment = commentResult.rows[0];

    // Check if user can edit this comment
    if (comment.user_id !== userData.id && userData.role !== 'orgAdmin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Update comment
    const result = await pool.query(`
      UPDATE ticket_comments 
      SET content = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [content.trim(), commentId]);

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating comment:', err);
    res.status(500).json({ error: 'Failed to update comment' });
  }
});

// DELETE /:commentId - Delete a comment
router.delete('/:commentId', async (req, res) => {
  try {
    const { commentId } = req.params;
    const user = req.kauth.grant.access_token.content;
    const userKeycloakId = user.sub;

    // Get user's organization and role
    const userResult = await pool.query(`
      SELECT u.id, ou.organization_id, ou.role
      FROM users u
      JOIN organization_users ou ON u.id = ou.user_id
      WHERE u.keycloak_id = $1
    `, [userKeycloakId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userData = userResult.rows[0];

    // Get comment and check ownership
    const commentResult = await pool.query(`
      SELECT tc.*, t.organization_id
      FROM ticket_comments tc
      JOIN tickets t ON tc.ticket_id = t.id
      WHERE tc.id = $1
    `, [commentId]);

    if (commentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const comment = commentResult.rows[0];

    // Check if user can delete this comment
    if (comment.user_id !== userData.id && userData.role !== 'orgAdmin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Delete comment
    await pool.query('DELETE FROM ticket_comments WHERE id = $1', [commentId]);

    res.json({ message: 'Comment deleted successfully' });
  } catch (err) {
    console.error('Error deleting comment:', err);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

module.exports = router;
