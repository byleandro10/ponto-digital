const { Client } = require('pg');
const mysql = require('mysql2/promise');

const sourceUrl = process.env.SOURCE_DATABASE_URL || process.env.SUPABASE_DATABASE_URL;
const targetUrl = process.env.DATABASE_URL;

if (!sourceUrl) {
  throw new Error('SOURCE_DATABASE_URL ou SUPABASE_DATABASE_URL é obrigatório.');
}

if (!targetUrl) {
  throw new Error('DATABASE_URL é obrigatório para o MySQL de destino.');
}

const tableOrder = [
  'Company',
  'User',
  'Employee',
  'Geofence',
  'NotificationSetting',
  'Notification',
  'TimeEntry',
  'TimeAdjustmentLog',
  'AdjustmentRequest',
  'Subscription',
  'Payment',
  'UsageLog',
];

function normalizeValue(value) {
  if (value === undefined) return null;
  if (value instanceof Date) return value;
  return value;
}

async function fetchRows(pgClient, tableName) {
  const result = await pgClient.query(`SELECT * FROM "${tableName}"`);
  return result.rows;
}

async function truncateTarget(mysqlConn) {
  await mysqlConn.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const tableName of [...tableOrder].reverse()) {
    await mysqlConn.query(`TRUNCATE TABLE \`${tableName}\``);
  }
  await mysqlConn.query('SET FOREIGN_KEY_CHECKS = 1');
}

async function insertRows(mysqlConn, tableName, rows) {
  if (!rows.length) return;

  const columns = Object.keys(rows[0]);
  const placeholders = columns.map(() => '?').join(', ');
  const sql = `INSERT INTO \`${tableName}\` (${columns.map((column) => `\`${column}\``).join(', ')}) VALUES (${placeholders})`;

  for (const row of rows) {
    const values = columns.map((column) => normalizeValue(row[column]));
    await mysqlConn.execute(sql, values);
  }
}

async function main() {
  const pgClient = new Client({ connectionString: sourceUrl });
  const mysqlConn = await mysql.createConnection(targetUrl);

  try {
    await pgClient.connect();
    await truncateTarget(mysqlConn);

    for (const tableName of tableOrder) {
      const rows = await fetchRows(pgClient, tableName);
      await insertRows(mysqlConn, tableName, rows);
      console.log(`[migrate] ${tableName}: ${rows.length} registro(s)`);
    }

    console.log('[migrate] Migração concluída com sucesso.');
  } finally {
    await pgClient.end();
    await mysqlConn.end();
  }
}

main().catch((error) => {
  console.error('[migrate] Falha:', error);
  process.exit(1);
});
