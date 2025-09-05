const express = require('express');
const pool = require('../config/db');
const multer = require('multer');
const { minioClient } = require('../config/minio');
const { v4: uuidv4 } = require('uuid');
const mammoth = require('mammoth');

const router = express.Router();

// Simple UUID validator
const isUuid = (value) => {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
};

// Utility function to clean HTML content to plain text
const cleanHtmlContent = (htmlContent) => {
  if (typeof htmlContent !== 'string') return htmlContent;

  const originalContent = htmlContent;
  const cleanedContent = htmlContent
    .replace(/<[^>]*>/g, '') // Remove all HTML tags
    .replace(/&nbsp;/g, ' ') // Replace &nbsp; with space
    .replace(/&amp;/g, '&') // Replace &amp; with &
    .replace(/&lt;/g, '<') // Replace &lt; with <
    .replace(/&gt;/g, '>') // Replace &gt; with >
    .replace(/&quot;/g, '"') // Replace &quot; with "
    .replace(/&#39;/g, "'") // Replace &#39; with '
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .trim(); // Remove leading/trailing whitespace

  if (originalContent !== cleanedContent) {
    console.log('🧹 Content cleaned:', {
      original: originalContent.substring(0, 100) + '...',
      cleaned: cleanedContent.substring(0, 100) + '...'
    });
  }

  return cleanedContent;
};

// Multer config for memory storage (we'll upload directly to MinIO)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

// Upload media file (now creates a ticket and saves attachment)
router.post("/upload", upload.single("file"), async (req, res) => {
  const { title, type, uploaded_by } = req.body;
  // Normalize optional fields; treat empty string as null
  const description = (req.body.description && req.body.description.trim()) || '';
  let priority_id = req.body.priority_id || null;
  let organization_id = req.body.organization_id || null;
  if (organization_id === '') organization_id = null;
  if (priority_id === '') priority_id = null;

  if (!req.file || !title || !uploaded_by) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    // Generate unique filename
    const fileExtension = req.file.originalname.split('.').pop();
    const uniqueFileName = `${uuidv4()}.${fileExtension}`;
    const bucketName = process.env.AWS_S3_BUCKET;

    // Upload to MinIO
    await minioClient.putObject(
      bucketName,
      uniqueFileName,
      req.file.buffer,
      req.file.size,
      {
        'Content-Type': req.file.mimetype,
        'Original-Name': req.file.originalname
      }
    );

    // Store full MinIO URL for file access
    const file_path = `${process.env.AWS_S3_ENDPOINT}/${bucketName}/${uniqueFileName}`;

    // Determine organization and role for the uploaded_by user
    const userOrgRes = await pool.query(
      `SELECT ou.organization_id, ou.role FROM organization_users ou WHERE ou.user_id = $1 LIMIT 1`,
      [uploaded_by]
    );
    const orgId = organization_id || userOrgRes.rows[0]?.organization_id || null;

    // Resolve priority if provided but not a UUID
    let resolvedPriorityId = null;
    console.log("🔍 Received priority_id:", priority_id, "orgId:", orgId);
    if (priority_id) {
      if (isUuid(priority_id)) {
        resolvedPriorityId = priority_id;
      } else if (orgId) {
        // Try by numeric level or name
        const normalized = String(priority_id).toLowerCase();
        const nameMap = {
          '1': 'low', '2': 'medium', '3': 'high', '4': 'critical', '5': 'emergency',
          'low': 'low', 'medium': 'medium', 'high': 'high', 'critical': 'critical', 'emergency': 'emergency'
        };
        const mappedName = nameMap[normalized] || null;
        let result;
        if (mappedName) {
          result = await pool.query(
            `SELECT id FROM ticket_priorities WHERE organization_id = $1 AND LOWER(name) = $2 LIMIT 1`,
            [orgId, mappedName]
          );
        } else if (/^[1-5]$/.test(normalized)) {
          result = await pool.query(
            `SELECT id FROM ticket_priorities WHERE organization_id = $1 AND level = $2::int LIMIT 1`,
            [orgId, normalized]
          );
        }
        if (result && result.rows.length > 0) {
          resolvedPriorityId = result.rows[0].id;
        }
      }
    }
    console.log("🔍 Resolved priority_id:", resolvedPriorityId);

    // Create a minimal ticket for this upload
    // Fallbacks: default priority/category as null if not provided
    const ticketRes = await pool.query(
      `INSERT INTO tickets (organization_id, ticket_number, title, description, category_id, priority_id, customer_id)
       VALUES ($1, generate_ticket_number($1), $2, $3, $4, $5, $6)
       RETURNING *`,
      [orgId, title, description || `Uploaded ${req.file.originalname}`, null, resolvedPriorityId, uploaded_by]
    );

    const ticket = ticketRes.rows[0];

    // Auto-assign to available agent if organization has auto-assign enabled
    try {
      const orgSettingsResult = await pool.query(
        'SELECT settings FROM organizations WHERE id = $1',
        [orgId]
      );
      if (orgSettingsResult.rows.length > 0) {
        const settings = orgSettingsResult.rows[0].settings || {};
        if (settings.auto_assign) {
          const algorithm = settings.assignment_algo || 'LAA';
          let agentId = null;
          if (algorithm === 'RR') {
            const { getRedis } = require('../config/redis');
            const redis = getRedis();
            const key = `org:${orgId}:agents:rr`;
            
            // Check if Redis queue exists, if not rebuild it
            const queueLength = await redis.llen(key);
            if (queueLength === 0) {
              console.log('Rebuilding Redis RR queue for org:', orgId);
              // Rebuild the queue from current agents
              const agents = await pool.query(`
                SELECT u.id as user_id
                FROM organization_users ou
                JOIN users u ON u.id = ou.user_id
                WHERE ou.organization_id = $1 AND ou.role = 'Agent'
                ORDER BY u.created_at ASC
              `, [orgId]);
              
              if (agents.rows.length > 0) {
                await redis.rpush(key, ...agents.rows.map(r => r.user_id));
                console.log('Rebuilt Redis queue with agents:', agents.rows.map(r => r.user_id));
              }
            }
            
            const nextAgent = await redis.lpop(key);
            if (nextAgent) {
              agentId = nextAgent;
              await redis.rpush(key, nextAgent);
              console.log('Assigned media ticket via RR to agent:', nextAgent);
            }
          }
          if (!agentId) {
            // Least Active Assignment via agent_availability
            const aa = await pool.query(
              `SELECT aa.user_id
               FROM agent_availability aa
               WHERE aa.organization_id = $1
               AND aa.is_available = true
               AND aa.current_tickets < aa.max_tickets
               ORDER BY aa.current_tickets ASC
               LIMIT 1`,
              [orgId]
            );
            if (aa.rows.length > 0) {
              agentId = aa.rows[0].user_id;
            } else {
              // Fallback: any agent in org
              const anyAgent = await pool.query(
                `SELECT user_id FROM organization_users WHERE organization_id = $1 AND role = 'Agent' LIMIT 1`,
                [orgId]
              );
              if (anyAgent.rows.length > 0) agentId = anyAgent.rows[0].user_id;
            }
          }
          if (agentId) {
            await pool.query(
              'UPDATE tickets SET assigned_agent_id = $1, assigned_by = $2 WHERE id = $3',
              [agentId, uploaded_by, ticket.id]
            );
            // reflect local variable for response
            ticket.assigned_agent_id = agentId;
          }
        }
      }
    } catch (assignErr) {
      console.warn('Auto-assign failed:', assignErr.message);
    }

    // Save attachment record
    const attachmentRes = await pool.query(
      `INSERT INTO ticket_attachments (ticket_id, filename, original_name, file_path, file_size, mime_type, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [ticket.id, uniqueFileName, req.file.originalname, file_path, req.file.size, req.file.mimetype, uploaded_by]
    );

    res.status(201).json({
      message: "Ticket created and file uploaded successfully",
      ticket,
      attachment: attachmentRes.rows[0]
    });
  } catch (err) {
    console.error("Error uploading to MinIO or saving ticket:", err.message);
    res.status(500).json({
      error: "Error uploading file",
      detail: err.message
    });
  }
});

// Get media for specific user only ✅
router.get('/', async (req, res) => {
  // Legacy endpoint retained for backward compatibility.
  // The project now uses tickets and ticket_attachments.
  // To avoid errors on clients still calling /media, return an empty list.
  try {
    return res.json([]);
  } catch (err) {
    return res.json([]);
  }
});

// Get single media item by ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT m.*, u.username AS uploaded_by_username
       FROM media m
       JOIN users u ON m.uploaded_by = u.id
       WHERE m.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Media file not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching media by ID:', err);
    res.status(500).json({ error: 'Error fetching media' });
  }
});

router.get('/upload', (req, res) => {
  res.send("Upload endpoint — use POST with form-data");
});


// Add this to your server/routes/media.js file

// Delete media file
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Get the file path before deleting the record
    const result = await pool.query('SELECT file_path FROM media WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Media file not found' });
    }

    const filePath = result.rows[0].file_path;

    // Delete the database record
    await pool.query('DELETE FROM media WHERE id = $1', [id]);

    // Delete file from MinIO
    try {
      // Extract object name from the full URL
      const urlParts = filePath.split('/');
      const objectName = urlParts[urlParts.length - 1];
      const bucketName = process.env.AWS_S3_BUCKET;

      await minioClient.removeObject(bucketName, objectName);
      console.log(`✅ File deleted from MinIO: ${objectName}`);
    } catch (minioErr) {
      console.error('Error deleting file from MinIO:', minioErr);
      // Don't fail the request if MinIO deletion fails
    }

    res.json({ message: 'Media file deleted successfully' });
  } catch (err) {
    console.error('Error deleting media:', err);
    res.status(500).json({ error: 'Error deleting media file' });
  }
});

// Edit/Update media title
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { title } = req.body;

  console.log('PATCH /media/:id called with:', { id, title });

  if (!title || !title.trim()) {
    console.log('Validation failed: Title is required');
    return res.status(400).json({ error: 'Title is required' });
  }

  try {
    const result = await pool.query(
      'UPDATE media SET title = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [title.trim(), id]
    );

    if (result.rows.length === 0) {
      console.log('No media found with id:', id);
      return res.status(404).json({ error: 'Media file not found' });
    }

    console.log('Media updated successfully:', result.rows[0]);
    res.json({
      message: 'Media updated successfully',
      media: result.rows
    });
  } catch (err) {
    console.error('Error updating media:', err.message);
    console.error('Full error:', err);
    res.status(500).json({ error: 'Error updating media file', detail: err.message });
  }
});

// Save document content
router.patch('/:id/content', async (req, res) => {
  const { id } = req.params;
  const { content, updated_by } = req.body;

  console.log('PATCH /media/:id/content called with:', { id, content: content?.substring(0, 100) + '...' });

  if (!content) {
    return res.status(400).json({ error: 'Content is required' });
  }

  try {
    // First check if the media exists and user has permission
    const mediaResult = await pool.query(
      'SELECT * FROM media WHERE id = $1',
      [id]
    );

    if (mediaResult.rows.length === 0) {
      return res.status(404).json({ error: 'Media file not found' });
    }

    const media = mediaResult.rows[0];

    // Check if user owns the document or has shared access
    if (media.uploaded_by !== updated_by) {
      // Check shared permissions
      const sharedResult = await pool.query(
        'SELECT permission_level FROM media_shared WHERE media_id = $1 AND shared_with = $2',
        [id, updated_by]
      );

      if (sharedResult.rows.length === 0 ||
        !['editor', 'reviewer'].includes(sharedResult.rows[0].permission_level)) {
        return res.status(403).json({ error: 'Permission denied' });
      }
    }

    // Update the document content in database
    const result = await pool.query(
      'UPDATE media SET content = $1, updated_at = CURRENT_TIMESTAMP, updated_by = $2 WHERE id = $3 RETURNING *',
      [content, updated_by, id]
    );

    // Also update the file in MinIO if it's a document
    if (media.type === 'document' && media.file_path) {
      try {
        const { minioClient } = require('../config/minio');
        const bucketName = process.env.AWS_S3_BUCKET;

        // Extract filename from file_path
        let fileName = media.file_path.split('/').pop();

        // Handle different file path formats
        if (media.file_path.includes('localhost:9000')) {
          // MinIO URL format: http://localhost:9000/docsy/filename.txt
          fileName = media.file_path.split('/').pop();
        } else if (media.file_path.includes('docsy/')) {
          // Bucket format: docsy/filename.txt
          fileName = media.file_path.split('docsy/').pop();
        }

        console.log('🔍 Save: File path analysis:', {
          fullPath: media.file_path,
          extractedFileName: fileName,
          bucketName: bucketName
        });

        if (fileName) {
          // Convert HTML content to clean plain text for storage
          const plainTextContent = cleanHtmlContent(content);

          // Update the file in MinIO
          await minioClient.putObject(
            bucketName,
            fileName,
            Buffer.from(plainTextContent, 'utf8'),
            Buffer.byteLength(plainTextContent, 'utf8'),
            {
              'Content-Type': 'text/plain',
              'Original-Name': fileName
            }
          );

          console.log('✅ Document file updated in MinIO successfully');
        }
      } catch (minioErr) {
        console.error('⚠️ Warning: Failed to update MinIO file:', minioErr.message);
        // Don't fail the request if MinIO update fails, just log it
      }
    }

    console.log('Document content updated successfully');
    res.json({
      message: 'Document content saved successfully',
      media: result.rows[0]
    });
  } catch (err) {
    console.error('Error saving document content:', err.message);
    res.status(500).json({ error: 'Error saving document content', detail: err.message });
  }
});

// Get document content from MinIO file
router.get('/:id/content', async (req, res) => {
  const { id } = req.params;

  try {
    // Get media info
    const mediaResult = await pool.query(
      'SELECT * FROM media WHERE id = $1',
      [id]
    );

    if (mediaResult.rows.length === 0) {
      return res.status(404).json({ error: 'Media file not found' });
    }

    const media = mediaResult.rows[0];

    // If it's not a document, return error
    if (media.type !== 'document') {
      return res.status(400).json({ error: 'This endpoint is only for documents' });
    }

    let content = media.content; // Try database content first

    // Always try to load from MinIO file for .docx/.doc files to get the latest content
    // For other files, only load if no content in database
    const shouldLoadFromFile = media.file_path && (
      !content ||
      media.file_path.toLowerCase().includes('.docx') ||
      media.file_path.toLowerCase().includes('.doc')
    );

    if (shouldLoadFromFile) {
      try {
        const { minioClient } = require('../config/minio');
        const bucketName = process.env.AWS_S3_BUCKET;

        // Extract filename from file_path
        let fileName = media.file_path.split('/').pop();

        // Handle different file path formats
        if (media.file_path.includes('localhost:9000')) {
          // MinIO URL format: http://localhost:9000/docsy/filename.txt
          fileName = media.file_path.split('/').pop();
        } else if (media.file_path.includes('docsy/')) {
          // Bucket format: docsy/filename.txt
          fileName = media.file_path.split('docsy/').pop();
        }

        console.log('🔍 Content: File path analysis:', {
          fullPath: media.file_path,
          extractedFileName: fileName,
          bucketName: bucketName
        });

        if (fileName) {
          console.log('🔍 Content: Attempting to load content from MinIO file:', fileName);
          // Get the file from MinIO
          const fileStream = await minioClient.getObject(bucketName, fileName);

          // Convert stream to string
          const chunks = [];
          fileStream.on('data', (chunk) => chunks.push(chunk));

          await new Promise((resolve, reject) => {
            fileStream.on('end', () => {
              const fileBuffer = Buffer.concat(chunks);

              // Handle different file types
              const fileExtension = fileName.split('.').pop().toLowerCase();

              if (fileExtension === 'docx' || fileExtension === 'doc') {
                // Handle .docx/.doc files using mammoth
                mammoth.extractRawText({ buffer: fileBuffer })
                  .then(result => {
                    content = result.value;
                    console.log('✅ Content extracted from .docx file using mammoth');
                    resolve();
                  })
                  .catch(mammothErr => {
                    console.error('⚠️ Mammoth extraction failed:', mammothErr.message);
                    content = 'Error extracting content from document file.';
                    resolve();
                  });
              } else {
                // Handle text files
                const fileContent = fileBuffer.toString('utf8');
                content = fileContent;
                console.log('✅ Content loaded from text file');
                resolve();
              }
            });
            fileStream.on('error', reject);
          });

          console.log('✅ Content loaded from MinIO file');

          // Update database with the loaded content
          await pool.query(
            'UPDATE media SET content = $1 WHERE id = $2',
            [content, id]
          );
        }
      } catch (minioErr) {
        console.error('⚠️ Warning: Failed to load from MinIO file:', minioErr.message);
        // If MinIO fails, return empty content
        content = '';
      }
    }

    // Clean HTML content if present
    let cleanContent = cleanHtmlContent(content || '');

    res.json({
      content: cleanContent,
      media_id: id,
      title: media.title,
      type: media.type
    });
  } catch (err) {
    console.error('Error getting document content:', err.message);
    res.status(500).json({ error: 'Error getting document content', detail: err.message });
  }
});

// Download document with updated content
router.get('/:id/download', async (req, res) => {
  const { id } = req.params;

  try {
    // Get media info
    const mediaResult = await pool.query(
      'SELECT * FROM media WHERE id = $1',
      [id]
    );

    if (mediaResult.rows.length === 0) {
      return res.status(404).json({ error: 'Media file not found' });
    }

    const media = mediaResult.rows[0];

    // If it's not a document, return error
    if (media.type !== 'document') {
      return res.status(400).json({ error: 'This endpoint is only for documents' });
    }

    let content = media.content; // Try database content first

    // Always try to load from MinIO file for uploaded documents
    // This ensures we get the most up-to-date content from the actual file
    if (media.file_path) {
      try {
        const { minioClient } = require('../config/minio');
        const bucketName = process.env.AWS_S3_BUCKET;

        // Extract filename from file_path
        let fileName = media.file_path.split('/').pop();

        // Handle different file path formats
        if (media.file_path.includes('localhost:9000')) {
          // MinIO URL format: http://localhost:9000/docsy/filename.txt
          fileName = media.file_path.split('/').pop();
        } else if (media.file_path.includes('docsy/')) {
          // Bucket format: docsy/filename.txt
          fileName = media.file_path.split('docsy/').pop();
        }

        console.log('🔍 Download: File path analysis:', {
          fullPath: media.file_path,
          extractedFileName: fileName,
          bucketName: bucketName
        });

        if (fileName) {
          console.log('🔍 Download: Attempting to load content from MinIO file:', fileName);

          // Get the file from MinIO
          const fileStream = await minioClient.getObject(bucketName, fileName);

          // Convert stream to string
          const chunks = [];
          fileStream.on('data', (chunk) => chunks.push(chunk));

          await new Promise((resolve, reject) => {
            fileStream.on('end', () => {
              const fileBuffer = Buffer.concat(chunks);

              // Handle different file types
              const fileExtension = fileName.split('.').pop().toLowerCase();

              if (fileExtension === 'docx' || fileExtension === 'doc') {
                // Handle .docx/.doc files using mammoth
                mammoth.extractRawText({ buffer: fileBuffer })
                  .then(result => {
                    const extractedContent = result.value;
                    console.log('📄 Download: Raw content from .docx file:', extractedContent.substring(0, 100) + '...');

                    // Use extracted content if it's not empty, otherwise fall back to database content
                    if (extractedContent && extractedContent.trim()) {
                      content = extractedContent;
                      console.log('✅ Download: Content extracted from .docx file, length:', extractedContent.length);
                    } else {
                      console.log('⚠️ Download: .docx file is empty, using database content');
                    }
                    resolve();
                  })
                  .catch(mammothErr => {
                    console.error('⚠️ Download: Mammoth extraction failed:', mammothErr.message);
                    console.log('📄 Download: Falling back to database content');
                    resolve();
                  });
              } else {
                // Handle text files
                const fileContent = fileBuffer.toString('utf8');
                console.log('📄 Download: Raw content from text file:', fileContent.substring(0, 100) + '...');

                // Use MinIO content if it's not empty, otherwise fall back to database content
                if (fileContent && fileContent.trim()) {
                  content = fileContent;
                  console.log('✅ Download: Content loaded from text file, length:', fileContent.length);
                } else {
                  console.log('⚠️ Download: Text file is empty, using database content');
                }
                resolve();
              }
            });
            fileStream.on('error', reject);
          });
        }
      } catch (minioErr) {
        console.error('⚠️ Download: Warning: Failed to load from MinIO file:', minioErr.message);
        console.log('📄 Download: Falling back to database content');
        // If MinIO fails, keep the database content
      }
    }

    // Set response headers for download
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${media.title}.txt"`);

    // Clean HTML content if present
    let cleanContent = cleanHtmlContent(content || 'No content available');

    // Send the clean content
    res.send(cleanContent);
  } catch (err) {
    console.error('Error downloading document:', err.message);
    res.status(500).json({ error: 'Error downloading document', detail: err.message });
  }
});


module.exports = router;