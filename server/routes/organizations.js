const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { validate: isUuid } = require('uuid');
const { getRedis } = require('../config/redis');

// GET /organizations/user/:userId - Get all organizations user is part of
router.get('/user/:userId', async (req, res) => {
  const { userId } = req.params;
  
  if (!isUuid(userId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  try {
    const result = await pool.query(`
      SELECT 
        o.id,
        o.name,
        o.keycloak_org_id,
        o.created_at,
        ou.role,
        ou.joined_at,
        (SELECT COUNT(*) FROM organization_users WHERE organization_id = o.id) as member_count
      FROM organizations o
      INNER JOIN organization_users ou ON o.id = ou.organization_id
      WHERE ou.user_id = $1
      ORDER BY ou.role = 'orgAdmin' DESC, o.created_at DESC
    `, [userId]);

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching user organizations:', err);
    res.status(500).json({ error: 'Failed to fetch organizations' });
  }
});

// GET /organizations/:orgId/members - Get all members of an organization
router.get('/:orgId/members', async (req, res) => {
    const { orgId } = req.params;
    
    if (!isUuid(orgId)) {
      return res.status(400).json({ error: 'Invalid organization ID' });
    }
  
    try {
      const result = await pool.query(`
        SELECT 
          u.id,
          u.username,
          u.email,
          ou.role,
          ou.joined_at,
          u.created_at as user_created_at
        FROM organization_users ou
        INNER JOIN users u ON ou.user_id = u.id
        WHERE ou.organization_id = $1
        ORDER BY ou.role = 'orgAdmin' DESC, ou.joined_at ASC
      `, [orgId]);
  
      res.json(result.rows);
    } catch (err) {
      console.error('Error fetching organization members:', err);
      res.status(500).json({ error: 'Failed to fetch organization members' });
    }
  });
  
// PUT /organizations/:orgId/assignment - update assignment settings and (optionally) rebuild RR queue
router.put('/:orgId/assignment', async (req, res) => {
  const { orgId } = req.params;
  const { auto_assign, assignment_algo, rebuild_rr } = req.body || {};

  if (!isUuid(orgId)) {
    return res.status(400).json({ error: 'Invalid organization ID' });
  }

  try {
    // Update settings jsonb
    const update = await pool.query(
      `UPDATE organizations
       SET settings = jsonb_set(
         jsonb_set(settings, '{auto_assign}', to_jsonb($1::boolean), true),
         '{assignment_algo}', to_jsonb($2::text), true
       )
       WHERE id = $3
       RETURNING settings`,
      [auto_assign === true, assignment_algo || 'LAA', orgId]
    );

    // Optionally rebuild RR queue from current Agent members
    if (rebuild_rr) {
      const agents = await pool.query(
        `SELECT u.id as user_id
         FROM organization_users ou
         JOIN users u ON u.id = ou.user_id
         WHERE ou.organization_id = $1 AND ou.role = 'Agent'
         ORDER BY u.created_at ASC`,
        [orgId]
      );
      const redis = getRedis();
      const key = `org:${orgId}:agents:rr`;
      await redis.del(key);
      if (agents.rows.length > 0) {
        await redis.rpush(key, ...agents.rows.map(r => r.user_id));
      }
    }

    res.json({ success: true, settings: update.rows[0]?.settings || {} });
  } catch (err) {
    console.error('Error updating assignment settings:', err);
    res.status(500).json({ error: 'Failed to update assignment settings' });
  }
});

// POST /organizations/:orgId/rr/rebuild - rebuild the RR queue from current Agents
router.post('/:orgId/rr/rebuild', async (req, res) => {
  const { orgId } = req.params;
  if (!isUuid(orgId)) {
    return res.status(400).json({ error: 'Invalid organization ID' });
  }
  try {
    const agents = await pool.query(
      `SELECT u.id as user_id
       FROM organization_users ou
       JOIN users u ON u.id = ou.user_id
       WHERE ou.organization_id = $1 AND ou.role = 'Agent'
       ORDER BY u.created_at ASC`,
      [orgId]
    );
    const redis = getRedis();
    const key = `org:${orgId}:agents:rr`;
    await redis.del(key);
    if (agents.rows.length > 0) {
      await redis.rpush(key, ...agents.rows.map(r => r.user_id));
    }
    res.json({ success: true, count: agents.rows.length });
  } catch (err) {
    console.error('Error rebuilding RR queue:', err);
    res.status(500).json({ error: 'Failed to rebuild RR queue' });
  }
});

module.exports = router;
