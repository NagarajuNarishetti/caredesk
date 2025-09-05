const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'docsy',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
});

async function runMigration() {
    const client = await pool.connect();

    try {
        console.log('🔄 Running database migration...');

        // Add content column if it doesn't exist
        await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name='media' AND column_name='content'
        ) THEN
          ALTER TABLE media ADD COLUMN content TEXT;
          RAISE NOTICE 'Added content column to media table';
        ELSE
          RAISE NOTICE 'Content column already exists';
        END IF;
      END
      $$;
    `);

        // Add updated_by column if it doesn't exist
        await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name='media' AND column_name='updated_by'
        ) THEN
          ALTER TABLE media ADD COLUMN updated_by UUID REFERENCES users(id);
          RAISE NOTICE 'Added updated_by column to media table';
        ELSE
          RAISE NOTICE 'Updated_by column already exists';
        END IF;
      END
      $$;
    `);

        // Add updated_at column if it doesn't exist
        await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name='media' AND column_name='updated_at'
        ) THEN
          ALTER TABLE media ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
          RAISE NOTICE 'Added updated_at column to media table';
        ELSE
          RAISE NOTICE 'Updated_at column already exists';
        END IF;
      END
      $$;
    `);

        // Create indexes
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_media_content ON media USING gin(to_tsvector('english', content));
    `);

        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_media_updated_by ON media(updated_by);
    `);

        console.log('✅ Database migration completed successfully!');

    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

runMigration().catch(console.error);
