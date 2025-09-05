const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { validate: isUuid } = require('uuid');
const { getRedis } = require('../config/redis');
const { publish } = require('../config/rabbitmq');
const { minioClient } = require('../config/minio');

// GET / - Get all tickets for the user's organization
router.get('/', async (req, res) => {
  try {
    // Optional fast-path: fetch tickets for a specific user across all orgs
    const { userId, assignedTo } = req.query;
    if (userId) {
      // Return tickets raised by this user (customer) across organizations
      const result = await pool.query(`
        SELECT 
          t.*,
          u.username as customer_name,
          u.email as customer_email,
          a.username as assigned_agent_name,
          o.name as organization_name,
          tp.name as priority_name,
          tp.level as priority_level
        FROM tickets t
        JOIN users u ON t.customer_id = u.id
        LEFT JOIN users a ON t.assigned_agent_id = a.id
        JOIN organizations o ON t.organization_id = o.id
        LEFT JOIN ticket_priorities tp ON t.priority_id = tp.id
        WHERE t.customer_id = $1
        ORDER BY t.created_at DESC
      `, [userId]);
      return res.json(result.rows);
    }

    if (assignedTo) {
      // Return tickets assigned to this agent (by user UUID), across orgs
      const result = await pool.query(`
        SELECT 
          t.*,
          u.username as customer_name,
          u.email as customer_email,
          a.username as assigned_agent_name,
          o.name as organization_name,
          tp.name as priority_name,
          tp.level as priority_level
        FROM tickets t
        JOIN users u ON t.customer_id = u.id
        LEFT JOIN users a ON t.assigned_agent_id = a.id
        JOIN organizations o ON t.organization_id = o.id
        LEFT JOIN ticket_priorities tp ON t.priority_id = tp.id
        WHERE t.assigned_agent_id = $1
        ORDER BY t.created_at DESC
      `, [assignedTo]);
      return res.json(result.rows);
    }

    const user = req.kauth.grant.access_token.content;
    const userKeycloakId = user.sub;

    // Get user's organization and role
    const userResult = await pool.query(`
      SELECT u.id, ou.organization_id, ou.role, o.name as organization_name
      FROM users u
      JOIN organization_users ou ON u.id = ou.user_id
      JOIN organizations o ON ou.organization_id = o.id
      WHERE u.keycloak_id = $1
    `, [userKeycloakId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found in any organization' });
    }

    const userData = userResult.rows[0];
    const { organization_id, role } = userData;

    let query = '';
    let params = [];

    if (role === 'orgAdmin') {
      // Org admins see all tickets in their organization
      query = `
        SELECT 
          t.*,
          u.username as customer_name,
          u.email as customer_email,
          a.username as assigned_agent_name,
          tc.name as category_name,
          tc.color as category_color,
          tp.name as priority_name,
          tp.color as priority_color,
          tp.level as priority_level
        FROM tickets t
        LEFT JOIN users u ON t.customer_id = u.id
        LEFT JOIN users a ON t.assigned_agent_id = a.id
        LEFT JOIN ticket_categories tc ON t.category_id = tc.id
        LEFT JOIN ticket_priorities tp ON t.priority_id = tp.id
        WHERE t.organization_id = $1
        ORDER BY t.created_at DESC
      `;
      params = [organization_id];
    } else if (role === 'Agent') {
      // Agents see tickets assigned to them
      query = `
        SELECT 
          t.*,
          u.username as customer_name,
          u.email as customer_email,
          a.username as assigned_agent_name,
          tc.name as category_name,
          tc.color as category_color,
          tp.name as priority_name,
          tp.color as priority_color,
          tp.level as priority_level
        FROM tickets t
        LEFT JOIN users u ON t.customer_id = u.id
        LEFT JOIN users a ON t.assigned_agent_id = a.id
        LEFT JOIN ticket_categories tc ON t.category_id = tc.id
        LEFT JOIN ticket_priorities tp ON t.priority_id = tp.id
        WHERE t.organization_id = $1 AND t.assigned_agent_id = $2
        ORDER BY t.created_at DESC
      `;
      params = [organization_id, userData.id];
    } else if (role === 'Customer') {
      // Customers see only their own tickets
      query = `
        SELECT 
          t.*,
          u.username as customer_name,
          u.email as customer_email,
          a.username as assigned_agent_name,
          tc.name as category_name,
          tc.color as category_color,
          tp.name as priority_name,
          tp.color as priority_color,
          tp.level as priority_level
        FROM tickets t
        LEFT JOIN users u ON t.customer_id = u.id
        LEFT JOIN users a ON t.assigned_agent_id = a.id
        LEFT JOIN ticket_categories tc ON t.category_id = tc.id
        LEFT JOIN ticket_priorities tp ON t.priority_id = tp.id
        WHERE t.organization_id = $1 AND t.customer_id = $2
        ORDER BY t.created_at DESC
      `;
      params = [organization_id, userData.id];
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching tickets:', err);
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
});

// GET /:ticketId - Get specific ticket details
router.get('/:ticketId', async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { assignedTo, userId } = req.query;

    // Shortcut path: allow fetching by explicit viewer id (agent or customer), without relying on Keycloak
    if (assignedTo || userId) {
      const viewerId = assignedTo || userId;
      // Ensure the viewer is either the customer or the assigned agent
      const base = await pool.query(`
        SELECT 
          t.*,
          u.username as customer_name,
          u.email as customer_email,
          a.username as assigned_agent_name,
          o.name as organization_name,
          tp.name as priority_name,
          tp.level as priority_level
        FROM tickets t
        JOIN users u ON t.customer_id = u.id
        LEFT JOIN users a ON t.assigned_agent_id = a.id
        JOIN organizations o ON t.organization_id = o.id
        LEFT JOIN ticket_priorities tp ON t.priority_id = tp.id
        WHERE t.id = $1 AND (t.assigned_agent_id = $2 OR t.customer_id = $2)
        LIMIT 1
      `, [ticketId, viewerId]);

      if (base.rows.length === 0) {
        return res.status(404).json({ error: 'Ticket not found' });
      }

      const commentsResult = await pool.query(`
        SELECT tc.*, u.username, u.email, u.first_name, u.last_name
        FROM ticket_comments tc
        JOIN users u ON tc.user_id = u.id
        WHERE tc.ticket_id = $1
        ORDER BY tc.created_at ASC
      `, [ticketId]);

      const attachmentsResult = await pool.query(`
        SELECT ta.*, u.username as uploaded_by_name
        FROM ticket_attachments ta
        JOIN users u ON ta.uploaded_by = u.id
        WHERE ta.ticket_id = $1
        ORDER BY ta.created_at ASC
      `, [ticketId]);

      const ticket = base.rows[0];
      ticket.comments = commentsResult.rows;
      // Attach presigned URLs for MinIO objects to enable preview in UI
      try {
        const bucketName = process.env.AWS_S3_BUCKET;
        const attachmentsWithUrls = await Promise.all(
          attachmentsResult.rows.map(async (att) => {
            let objectName = (att.file_path || '').split('/').pop();
            try {
              const url = await minioClient.presignedGetObject(bucketName, objectName, 24 * 60 * 60); // 24h
              return { ...att, presigned_url: url };
            } catch (e) {
              return { ...att };
            }
          })
        );
        ticket.attachments = attachmentsWithUrls;
      } catch (e) {
        ticket.attachments = attachmentsResult.rows;
      }
      return res.json(ticket);
    }

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

    // Get ticket with access control
    let query = `
      SELECT 
        t.*,
        u.username as customer_name,
        u.email as customer_email,
        a.username as assigned_agent_name,
        tc.name as category_name,
        tc.color as category_color,
        tp.name as priority_name,
        tp.color as priority_color,
        tp.level as priority_level
      FROM tickets t
      LEFT JOIN users u ON t.customer_id = u.id
      LEFT JOIN users a ON t.assigned_agent_id = a.id
      LEFT JOIN ticket_categories tc ON t.category_id = tc.id
      LEFT JOIN ticket_priorities tp ON t.priority_id = tp.id
      WHERE t.id = $1 AND t.organization_id = $2
    `;

    let params = [ticketId, userData.organization_id];

    // Add role-based filtering
    if (userData.role === 'Agent') {
      query += ' AND t.assigned_agent_id = $3';
      params.push(userData.id);
    } else if (userData.role === 'Customer') {
      query += ' AND t.customer_id = $3';
      params.push(userData.id);
    }

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Get comments for this ticket
    const commentsResult = await pool.query(`
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

    // Get attachments for this ticket
    const attachmentsResult = await pool.query(`
      SELECT 
        ta.*,
        u.username as uploaded_by_name
      FROM ticket_attachments ta
      JOIN users u ON ta.uploaded_by = u.id
      WHERE ta.ticket_id = $1
      ORDER BY ta.created_at ASC
    `, [ticketId]);

    const ticket = result.rows[0];
    ticket.comments = commentsResult.rows;
    // Attach presigned URLs for MinIO objects to enable preview in UI
    try {
      const bucketName = process.env.AWS_S3_BUCKET;
      const attachmentsWithUrls = await Promise.all(
        attachmentsResult.rows.map(async (att) => {
          let objectName = (att.file_path || '').split('/').pop();
          try {
            const url = await minioClient.presignedGetObject(bucketName, objectName, 24 * 60 * 60); // 24h
            return { ...att, presigned_url: url };
          } catch (e) {
            return { ...att };
          }
        })
      );
      ticket.attachments = attachmentsWithUrls;
    } catch (e) {
      ticket.attachments = attachmentsResult.rows;
    }

    res.json(ticket);
  } catch (err) {
    console.error('Error fetching ticket:', err);
    res.status(500).json({ error: 'Failed to fetch ticket' });
  }
});

// POST / - Create a new ticket
router.post('/', async (req, res) => {
  try {
    const user = req.kauth.grant.access_token.content;
    const userKeycloakId = user.sub;
    const { title, description, category_id, priority_id } = req.body;

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

    // Only customers can create tickets
    if (userData.role !== 'Customer') {
      return res.status(403).json({ error: 'Only customers can create tickets' });
    }

    // Generate ticket number
    const ticketNumberResult = await pool.query(
      'SELECT generate_ticket_number($1) as ticket_number',
      [userData.organization_id]
    );
    const ticketNumber = ticketNumberResult.rows[0].ticket_number;

    // Create ticket
    const result = await pool.query(`
      INSERT INTO tickets (organization_id, ticket_number, title, description, category_id, priority_id, customer_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [userData.organization_id, ticketNumber, title, description, category_id, priority_id, userData.id]);

    // Auto-assign to available agent if organization has auto-assign enabled
    const orgSettingsResult = await pool.query(
      'SELECT settings FROM organizations WHERE id = $1',
      [userData.organization_id]
    );

    if (orgSettingsResult.rows.length > 0) {
      const settings = orgSettingsResult.rows[0].settings;
      if (settings.auto_assign) {
        const algorithm = settings.assignment_algo || 'LAA'; // 'RR' or 'LAA'
        let agentId = null;

        if (algorithm === 'RR') {
          // Round-robin using Redis list per organization
          const redis = getRedis();
          const key = `org:${userData.organization_id}:agents:rr`;

          // Check if Redis queue exists, if not rebuild it
          const queueLength = await redis.llen(key);
          if (queueLength === 0) {
            console.log('Rebuilding Redis RR queue for org:', userData.organization_id);
            // Rebuild the queue from current agents
            const agents = await pool.query(`
              SELECT u.id as user_id
              FROM organization_users ou
              JOIN users u ON u.id = ou.user_id
              WHERE ou.organization_id = $1 AND ou.role = 'Agent'
              ORDER BY u.created_at ASC
            `, [userData.organization_id]);

            if (agents.rows.length > 0) {
              await redis.rpush(key, ...agents.rows.map(r => r.user_id));
              console.log('Rebuilt Redis queue with agents:', agents.rows.map(r => r.user_id));
            }
          }

          // Rotate: pop from left, push to right
          const nextAgent = await redis.lpop(key);
          if (nextAgent) {
            agentId = nextAgent;
            await redis.rpush(key, nextAgent);
            console.log('Assigned ticket via RR to agent:', nextAgent);
          }
        }

        if (!agentId) {
          // Least Active Assignment fallback using SQL
          const agentResult = await pool.query(`
            SELECT aa.user_id
            FROM agent_availability aa
            WHERE aa.organization_id = $1 
            AND aa.is_available = true 
            AND aa.current_tickets < aa.max_tickets
            ORDER BY aa.current_tickets ASC
            LIMIT 1
          `, [userData.organization_id]);
          if (agentResult.rows.length > 0) {
            agentId = agentResult.rows[0].user_id;
            console.log('Assigned ticket via LAA to agent:', agentId);
          } else {
            // Final fallback: any agent in org
            const anyAgent = await pool.query(`
              SELECT user_id FROM organization_users 
              WHERE organization_id = $1 AND role = 'Agent' 
              LIMIT 1
            `, [userData.organization_id]);
            if (anyAgent.rows.length > 0) {
              agentId = anyAgent.rows[0].user_id;
              console.log('Assigned ticket via fallback to agent:', agentId);
            }
          }
        }

        if (agentId) {
          await pool.query(
            'UPDATE tickets SET assigned_agent_id = $1, assigned_by = $2 WHERE id = $3',
            [agentId, userData.id, result.rows[0].id]
          );
          console.log('Successfully assigned ticket to agent:', agentId);
        } else {
          console.log('No available agents found for auto-assignment');
        }
      }
    }

    // Queue background job for notifications/reporting
    try {
      await publish('ticket_created', {
        ticket: result.rows[0],
        organization_id: userData.organization_id,
      });
    } catch (queueErr) {
      console.warn('RabbitMQ publish failed:', queueErr.message);
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating ticket:', err);
    res.status(500).json({ error: 'Failed to create ticket' });
  }
});

// PUT /:ticketId - Update ticket status
router.put('/:ticketId', async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { status, assigned_agent_id, description } = req.body;
    const { assignedTo, userId } = req.query || {};
    console.log('PUT /tickets/:ticketId called with:', { ticketId, status, assigned_agent_id, description });

    // Shortcut path: Allow explicit viewer context (agent or customer) without relying on Keycloak
    // Mirrors the GET handler's optional flow
    if (assignedTo || userId) {
      const viewerId = assignedTo || userId;
      // Fetch ticket with minimal joins
      const base = await pool.query(`
        SELECT t.* FROM tickets t WHERE t.id = $1
      `, [ticketId]);

      if (base.rows.length === 0) {
        return res.status(404).json({ error: 'Ticket not found' });
      }

      const ticket = base.rows[0];

      // Ensure viewer is either the assigned agent or the customer
      if (!(ticket.assigned_agent_id === viewerId || ticket.customer_id === viewerId)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Build update
      const updateFields = [];
      const updateValues = [];
      let paramCount = 1;

      if (status) {
        updateFields.push(`status = $${paramCount++}`);
        updateValues.push(status);
        if (status === 'resolved') {
          updateFields.push('resolved_at = CURRENT_TIMESTAMP');
        } else if (status === 'closed') {
          updateFields.push('closed_at = CURRENT_TIMESTAMP');
        }
      }

      if (typeof description === 'string') {
        updateFields.push(`description = $${paramCount++}`);
        updateValues.push(description);
      }

      if (updateFields.length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
      }

      updateValues.push(ticketId);
      const query = `
        UPDATE tickets
        SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${paramCount}
        RETURNING *
      `;

      const result = await pool.query(query, updateValues);

      // Log history with viewer context (no role available here)
      await pool.query(`
        INSERT INTO ticket_history (ticket_id, action, field_name, old_value, new_value)
        VALUES ($1, $2, $3, $4, $5)
      `, [ticketId, 'update', 'status', ticket.status, status]);

      return res.json(result.rows[0]);
    }

    // Default path: Keycloak-authenticated flow
    if (!req.kauth || !req.kauth.grant || !req.kauth.grant.access_token) {
      console.log('❌ No authentication found');
      return res.status(401).json({ error: 'Authentication required' });
    }

    const user = req.kauth.grant.access_token.content;
    const userKeycloakId = user.sub;
    console.log('User Keycloak ID:', userKeycloakId);

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

    // Check if user can update this ticket
    const ticketResult = await pool.query(`
      SELECT * FROM tickets 
      WHERE id = $1 AND organization_id = $2
    `, [ticketId, userData.organization_id]);

    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const ticket = ticketResult.rows[0];

    // Role-based permissions
    if (userData.role === 'Customer') {
      if (ticket.customer_id !== userData.id) {
        return res.status(403).json({ error: 'Access denied' });
      }
      // Customers can only update limited fields
      if (status && !['open', 'closed'].includes(status)) {
        return res.status(403).json({ error: 'Customers can only open or close tickets' });
      }
    } else if (userData.role === 'Agent') {
      if (ticket.assigned_agent_id !== userData.id) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    // Update ticket
    const updateFields = [];
    const updateValues = [];
    let paramCount = 1;

    if (status) {
      updateFields.push(`status = $${paramCount++}`);
      updateValues.push(status);

      // Set timestamp fields based on status
      if (status === 'resolved') {
        updateFields.push(`resolved_at = CURRENT_TIMESTAMP`);
      } else if (status === 'closed') {
        updateFields.push(`closed_at = CURRENT_TIMESTAMP`);
      }
    }

    if (assigned_agent_id && userData.role === 'orgAdmin') {
      updateFields.push(`assigned_agent_id = $${paramCount++}`);
      updateValues.push(assigned_agent_id);
      updateFields.push(`assigned_by = $${paramCount++}`);
      updateValues.push(userData.id);
    }

    // Allow customers (owner) or orgAdmin to edit description
    if (typeof description === 'string') {
      if (userData.role === 'Customer' && ticket.customer_id !== userData.id) {
        return res.status(403).json({ error: 'Access denied' });
      }
      updateFields.push(`description = $${paramCount++}`);
      updateValues.push(description);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    updateValues.push(ticketId);
    const query = `
      UPDATE tickets 
      SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, updateValues);

    // Log the change in ticket history
    await pool.query(`
      INSERT INTO ticket_history (ticket_id, user_id, action, field_name, old_value, new_value)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [ticketId, userData.id, 'update', 'status', ticket.status, status]);

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating ticket:', err);
    res.status(500).json({ error: 'Failed to update ticket' });
  }
});

// GET /categories - Get ticket categories for organization
router.get('/categories', async (req, res) => {
  try {
    const user = req.kauth.grant.access_token.content;
    const userKeycloakId = user.sub;

    const userResult = await pool.query(`
      SELECT ou.organization_id
      FROM users u
      JOIN organization_users ou ON u.id = ou.user_id
      WHERE u.keycloak_id = $1
    `, [userKeycloakId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const result = await pool.query(`
      SELECT * FROM ticket_categories 
      WHERE organization_id = $1 AND is_active = true
      ORDER BY name
    `, [userResult.rows[0].organization_id]);

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching categories:', err);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// GET /priorities - Get ticket priorities for organization
router.get('/priorities', async (req, res) => {
  try {
    const user = req.kauth.grant.access_token.content;
    const userKeycloakId = user.sub;

    const userResult = await pool.query(`
      SELECT ou.organization_id
      FROM users u
      JOIN organization_users ou ON u.id = ou.user_id
      WHERE u.keycloak_id = $1
    `, [userKeycloakId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const result = await pool.query(`
      SELECT * FROM ticket_priorities 
      WHERE organization_id = $1 AND is_active = true
      ORDER BY level
    `, [userResult.rows[0].organization_id]);

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching priorities:', err);
    res.status(500).json({ error: 'Failed to fetch priorities' });
  }
});

// DELETE /:ticketId - Delete a ticket (customer owner or org admin only)
router.delete('/:ticketId', async (req, res) => {
  try {
    const { ticketId } = req.params;
    console.log('Delete ticket request - Ticket ID:', ticketId);

    const user = req.kauth?.grant?.access_token?.content;
    const userKeycloakId = user?.sub;
    console.log('Delete ticket request - User Keycloak ID:', userKeycloakId);

    if (!userKeycloakId) {
      console.log('Delete ticket - No user Keycloak ID found');
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userResult = await pool.query(`
      SELECT u.id, ou.organization_id, ou.role
      FROM users u
      JOIN organization_users ou ON u.id = ou.user_id
      WHERE u.keycloak_id = $1
    `, [userKeycloakId]);

    if (userResult.rows.length === 0) {
      console.log('Delete ticket - User not found in database');
      return res.status(404).json({ error: 'User not found' });
    }

    const userData = userResult.rows[0];
    console.log('Delete ticket - User data:', { userId: userData.id, role: userData.role, orgId: userData.organization_id });

    const ticketResult = await pool.query(`
      SELECT * FROM tickets WHERE id = $1 AND organization_id = $2
    `, [ticketId, userData.organization_id]);

    if (ticketResult.rows.length === 0) {
      console.log('Delete ticket - Ticket not found:', { ticketId, orgId: userData.organization_id });
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const ticket = ticketResult.rows[0];
    console.log('Delete ticket - Ticket data:', { ticketId, customerId: ticket.customer_id, assignedAgentId: ticket.assigned_agent_id });

    // Only org admin or the customer who created it can delete
    if (!(userData.role === 'orgAdmin' || ticket.customer_id === userData.id)) {
      console.log('Delete ticket - Access denied:', { userRole: userData.role, ticketCustomerId: ticket.customer_id, userId: userData.id });
      return res.status(403).json({ error: 'Access denied' });
    }

    console.log('Delete ticket - Proceeding with deletion');

    // Delete attachments first (DB rows; physical files remain in MinIO)
    await pool.query('DELETE FROM ticket_attachments WHERE ticket_id = $1', [ticketId]);
    await pool.query('DELETE FROM ticket_comments WHERE ticket_id = $1', [ticketId]);
    await pool.query('DELETE FROM ticket_history WHERE ticket_id = $1', [ticketId]);
    await pool.query('DELETE FROM tickets WHERE id = $1', [ticketId]);

    console.log('Delete ticket - Successfully deleted');
    res.json({ message: 'Ticket deleted successfully' });
  } catch (err) {
    console.error('Error deleting ticket:', err);
    res.status(500).json({ error: 'Failed to delete ticket' });
  }
});

module.exports = router;
