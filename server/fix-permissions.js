const { Pool } = require('pg');

// Database configuration
const pool = new Pool({
  user: 'docsyuser',
  host: 'localhost',
  database: 'docsydb',
  password: 'docsypass',
  port: 5432,
});

async function fixPermissions() {
  try {
    console.log('🔧 Fixing permission levels in media_shared table...');
    
    // First, let's see what needs to be fixed
    const checkResult = await pool.query(`
      SELECT 
        ms.*,
        m.title,
        u_sharer.username AS sharer_username,
        u_receiver.username AS receiver_username,
        ou.role AS org_role
      FROM media_shared ms
      JOIN media m ON ms.media_id = m.id
      JOIN users u_sharer ON ms.shared_by = u_sharer.id
      JOIN users u_receiver ON ms.shared_with = u_receiver.id
      JOIN organization_users ou ON ou.user_id = ms.shared_with AND ou.organization_id = ms.organization_id
      WHERE ms.permission_level IN ('owner', 'reviewer', 'viewer')
      ORDER BY ms.shared_at DESC
    `);
    
    console.log('📊 Records that need fixing:');
    checkResult.rows.forEach((row, index) => {
      console.log(`${index + 1}. Media: ${row.title}`);
      console.log(`   Shared by: ${row.sharer_username}`);
      console.log(`   Shared with: ${row.receiver_username}`);
      console.log(`   Current Permission Level: ${row.permission_level}`);
      console.log(`   Organization Role: ${row.org_role}`);
      console.log('   ---');
    });
    
    // Fix the permission levels
    for (const row of checkResult.rows) {
      let newPermissionLevel;
      
      // Map organization roles to permission levels (same logic as sharing)
      switch (row.org_role) {
        case 'owner':
          newPermissionLevel = 'editor';
          break;
        case 'reviewer':
          newPermissionLevel = 'reviewer';
          break;
        case 'viewer':
          newPermissionLevel = 'viewer';
          break;
        default:
          newPermissionLevel = 'viewer';
      }
      
      if (newPermissionLevel !== row.permission_level) {
        console.log(`🔄 Updating ${row.title}: ${row.permission_level} → ${newPermissionLevel}`);
        
        await pool.query(
          'UPDATE media_shared SET permission_level = $1 WHERE id = $2',
          [newPermissionLevel, row.id]
        );
      } else {
        console.log(`✅ ${row.title}: Already correct (${row.permission_level})`);
      }
    }
    
    console.log('✅ Permission levels fixed successfully!');
    
    // Show the results after fixing
    const finalResult = await pool.query(`
      SELECT 
        ms.*,
        m.title,
        u_sharer.username AS sharer_username,
        u_receiver.username AS receiver_username
      FROM media_shared ms
      JOIN media m ON ms.media_id = m.id
      JOIN users u_sharer ON ms.shared_by = u_sharer.id
      JOIN users u_receiver ON ms.shared_with = u_receiver.id
      ORDER BY ms.shared_at DESC
      LIMIT 10
    `);
    
    console.log('📊 Final permission levels:');
    finalResult.rows.forEach((row, index) => {
      console.log(`${index + 1}. Media: ${row.title}`);
      console.log(`   Shared by: ${row.sharer_username}`);
      console.log(`   Shared with: ${row.receiver_username}`);
      console.log(`   Permission Level: ${row.permission_level}`);
      console.log('   ---');
    });
    
  } catch (error) {
    console.error('❌ Error fixing permissions:', error);
  } finally {
    await pool.end();
  }
}

fixPermissions();
