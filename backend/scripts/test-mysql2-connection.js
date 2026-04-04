const mysql = require('mysql2/promise');
const { loadEnv } = require('../src/config/env');
const { getResolvedDatabaseUrl, getDatabaseDiagnostics } = require('../src/config/databaseConfig');

loadEnv();

async function main() {
  const databaseUrl = getResolvedDatabaseUrl(process.env);
  const diagnostics = getDatabaseDiagnostics(process.env);

  console.log('[mysql2-test] config:', {
    host: diagnostics.host,
    port: diagnostics.port,
    database: diagnostics.database,
    connectionLimit: diagnostics.connectionLimit,
    poolTimeout: diagnostics.poolTimeout,
    connectTimeout: diagnostics.connectTimeout,
    socket: diagnostics.socket || undefined,
    sslaccept: diagnostics.sslaccept || undefined,
  });

  const connection = await mysql.createConnection(databaseUrl);
  const [rows] = await connection.query('SELECT 1 AS ok, CURRENT_USER() AS currentUser, DATABASE() AS databaseName');
  console.log('[mysql2-test] success:', rows[0]);
  await connection.end();
}

main().catch((error) => {
  console.error('[mysql2-test] failure:', {
    code: error.code || 'UNKNOWN',
    errno: error.errno,
    sqlState: error.sqlState,
    sqlMessage: error.sqlMessage,
    message: error.message,
  });
  process.exit(1);
});
