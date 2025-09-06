const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

async function checkTables() {
    try {
        console.log('📊 All Tables in your database:');
        console.log('================================');

        // Get all table names
        const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);

        result.rows.forEach((table, index) => {
            console.log(`${index + 1}. ${table.table_name}`);
        });

        console.log(`\n📈 Total Tables: ${result.rows.length}`);

        // Get table details with row counts
        console.log('\n📋 Table Details:');
        console.log('==================');

        for (const table of result.rows) {
            try {
                const countResult = await pool.query(`SELECT COUNT(*) FROM ${table.table_name}`);
                const rowCount = countResult.rows[0].count;
                console.log(`${table.table_name}: ${rowCount} rows`);
            } catch (err) {
                console.log(`${table.table_name}: Error getting count`);
            }
        }

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await pool.end();
    }
}

checkTables();
