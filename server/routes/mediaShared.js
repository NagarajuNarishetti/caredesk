const express = require("express");
const pool = require("../config/db");

const router = express.Router();

// POST /media-shared/share - Enhanced sharing with organization check
router.post("/share", async (req, res) => {
  const { media_id, shared_by, shared_with, message } = req.body;

  if (!media_id || !shared_by || !shared_with) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    console.log('🔍 Starting share process:', { media_id, shared_by, shared_with });

    // Check if users are in the same organization and get their roles
    const orgCheck = await pool.query(
      `
      SELECT
        ou1.organization_id,
        ou1.role as sharer_role,
        ou2.role as receiver_role,
        o.name as organization_name
      FROM organization_users ou1
      JOIN organization_users ou2 ON ou1.organization_id = ou2.organization_id
      JOIN organizations o ON ou1.organization_id = o.id
      WHERE ou1.user_id = $1 AND ou2.user_id = $2
    `,
      [shared_by, shared_with]
    );

    console.log('🔍 Organization check result:', orgCheck.rows);

    if (orgCheck.rows.length === 0) {
      return res
        .status(403)
        .json({
          error: "Users must be in the same organization to share media",
        });
    }

    const orgData = orgCheck.rows[0];

    // Make sure the media belongs to the sharer
    const mediaCheck = await pool.query(
      "SELECT id, title FROM media WHERE id = $1 AND uploaded_by = $2",
      [media_id, shared_by]
    );

    if (mediaCheck.rows.length === 0) {
      return res
        .status(403)
        .json({ error: "You can only share your own media" });
    }

    // Check if the media was already shared with this user
    const existingShare = await pool.query(
      "SELECT id FROM media_shared WHERE media_id = $1 AND shared_with = $2",
      [media_id, shared_with]
    );

    if (existingShare.rows.length > 0) {
      return res
        .status(400)
        .json({ error: "Media already shared with this user" });
    }

    // Get the organization_id from the organization check we already did
    const sharerOrganizationId = orgData.organization_id;

    // Map organization roles to permission levels
    console.log('🔍 Mapping role to permission:', { receiver_role: orgData.receiver_role });

    let permissionLevel;
    switch (orgData.receiver_role) {
      case 'owner':
        permissionLevel = 'editor';
        break;
      case 'reviewer':
        permissionLevel = 'reviewer';
        break;
      case 'viewer':
        permissionLevel = 'viewer';
        break;
      default:
        permissionLevel = 'viewer';
    }

    console.log('🔍 Mapped permission level:', permissionLevel);

    // Create the share record using mapped permission_level
    const result = await pool.query(
      `
      INSERT INTO media_shared (media_id, shared_by, shared_with, message, permission_level, organization_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `,
      [
        media_id,
        shared_by,
        shared_with,
        message?.trim() || null,
        permissionLevel,
        sharerOrganizationId,
      ]
    );

    console.log("✅ Media shared successfully:", {
      media_id,
      shared_by,
      shared_with,
      org_role: orgData.receiver_role,
      permission_level: permissionLevel,
      organization_id: sharerOrganizationId,
      organization_name: orgData.organization_name
    });

    res.status(201).json({
      message: "Media shared successfully",
      share: result.rows[0],
    });
  } catch (err) {
    console.error("Error sharing media:", err);
    res.status(500).json({ error: "Error sharing media", detail: err.message });
  }
});

// GET /media-shared/:userId - Get shared media with role-based organization info
router.get("/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    // Validate userId is a UUID (basic check)
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId)) {
      return res.status(400).json({ error: "Invalid user ID format" });
    }

    // Select shared media including sharer's username and organization name for context
    const result = await pool.query(
      `
      SELECT
        m.*,
        ms.shared_at,
        ms.message,
        ms.permission_level,
        ms.organization_id,
        u_sharer.username AS shared_by_username,
        COALESCE(o.name, 'Unknown Organization') AS organization_name
      FROM media_shared ms
      JOIN media m ON ms.media_id = m.id
      JOIN users u_sharer ON ms.shared_by = u_sharer.id
      LEFT JOIN organizations o ON ms.organization_id = o.id
      WHERE ms.shared_with = $1
      ORDER BY ms.shared_at DESC
    `,
      [userId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching shared media:", err);
    res
      .status(500)
      .json({ error: "Error fetching shared media", detail: err.message });
  }
});

// GET /media-shared/:mediaId/permissions - Get user's permission level for a specific media
router.get("/:mediaId/permissions", async (req, res) => {
  const { mediaId } = req.params;
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: "Missing userId query parameter" });
  }

  try {
    // Validate mediaId is a UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(mediaId)) {
      return res.status(400).json({ error: "Invalid media ID format" });
    }

    // Check if user owns the media
    const mediaResult = await pool.query(
      "SELECT uploaded_by FROM media WHERE id = $1",
      [mediaId]
    );

    if (mediaResult.rows.length === 0) {
      return res.status(404).json({ error: "Media not found" });
    }

    // If user owns the media, they have editor permissions
    if (mediaResult.rows[0].uploaded_by === userId) {
      return res.json({ permission_level: 'editor' });
    }

    // Check if media is shared with the user
    const sharedResult = await pool.query(
      "SELECT permission_level FROM media_shared WHERE media_id = $1 AND shared_with = $2",
      [mediaId, userId]
    );

    if (sharedResult.rows.length === 0) {
      return res.json({ permission_level: 'viewer' }); // Default to viewer if not shared
    }

    const permission = sharedResult.rows[0].permission_level;
    res.json({ permission_level: permission });
  } catch (err) {
    console.error("Error fetching media permissions:", err);
    res.status(500).json({ error: "Error fetching media permissions", detail: err.message });
  }
});

// GET /media-shared/debug/permissions/:mediaId - Debug endpoint to check all permissions for a media
router.get("/debug/permissions/:mediaId", async (req, res) => {
  const { mediaId } = req.params;

  try {
    // Get all sharing records for this media
    const result = await pool.query(
      `
      SELECT
        ms.*,
        u_sharer.username AS sharer_username,
        u_receiver.username AS receiver_username,
        o.name AS organization_name
      FROM media_shared ms
      JOIN users u_sharer ON ms.shared_by = u_sharer.id
      JOIN users u_receiver ON ms.shared_with = u_receiver.id
      LEFT JOIN organizations o ON ms.organization_id = o.id
      WHERE ms.media_id = $1
      ORDER BY ms.shared_at DESC
    `,
      [mediaId]
    );

    // Also get the media info
    const mediaResult = await pool.query(
      "SELECT id, title, uploaded_by, type FROM media WHERE id = $1",
      [mediaId]
    );

    res.json({
      media: mediaResult.rows[0] || null,
      shared_permissions: result.rows,
      total_shares: result.rows.length
    });
  } catch (err) {
    console.error("Error debugging media permissions:", err);
    res.status(500).json({ error: "Error debugging media permissions", detail: err.message });
  }
});

// GET /media-shared/debug/users/:organizationId - Debug endpoint to check users in an organization
router.get("/debug/users/:organizationId", async (req, res) => {
  const { organizationId } = req.params;

  try {
    // Get all users in the organization with their roles
    const result = await pool.query(
      `
      SELECT 
        u.id,
        u.username,
        u.email,
        ou.role as org_role,
        ou.joined_at
      FROM organization_users ou
      JOIN users u ON ou.user_id = u.id
      WHERE ou.organization_id = $1
      ORDER BY u.username
    `,
      [organizationId]
    );

    res.json({
      organization_id: organizationId,
      users: result.rows
    });
  } catch (err) {
    console.error("Error fetching organization users:", err);
    res.status(500).json({ error: "Error fetching organization users", detail: err.message });
  }
});

module.exports = router;
