const mysql = require('mysql2/promise');
const { getResolvedDatabaseUrl } = require('../src/config/databaseConfig');
const {
  getCurrentDatabaseName,
  prepareBillingUniqueColumns,
} = require('../src/services/dbPrepareService');
const {
  runPrismaDbPush,
  shouldRetryWithAcceptDataLoss,
} = require('../src/services/prismaSchemaSyncService');

async function cleanupLegacyBillingData(databaseUrl) {
  const connection = await mysql.createConnection(databaseUrl);

  try {
    const databaseName = await getCurrentDatabaseName(connection);

    if (!databaseName) {
      console.log('[db:prepare] DATABASE() vazio. Pulando preflight de billing.');
      return;
    }

    const results = await prepareBillingUniqueColumns(connection, databaseName);
    const normalizedBlankRows = results.reduce((total, result) => total + result.normalizedBlankRows, 0);
    const clearedDuplicateRows = results.reduce((total, result) => total + result.clearedDuplicateRows, 0);

    console.log('[db:prepare] preflight de billing concluido.', {
      databaseName,
      normalizedBlankRows,
      clearedDuplicateRows,
      touchedTargets: results.filter((result) => !result.skipped).length,
    });
  } finally {
    await connection.end();
  }
}

async function main() {
  let databaseUrl = '';

  try {
    databaseUrl = getResolvedDatabaseUrl(process.env);
    process.env.DATABASE_URL = databaseUrl;
  } catch (error) {
    console.log(`[db:prepare] ${error.message} Pulando bootstrap do schema.`);
    process.exit(0);
  }

  if (!databaseUrl) {
    console.log('[db:prepare] DATABASE_URL ausente. Pulando bootstrap do schema.');
    process.exit(0);
  }

  if (!databaseUrl.startsWith('mysql://')) {
    console.log('[db:prepare] DATABASE_URL nao e MySQL. Pulando bootstrap do schema.');
    process.exit(0);
  }

  console.log('[db:prepare] Preparando dados legados antes de sincronizar o schema...');
  await cleanupLegacyBillingData(databaseUrl);

  console.log('[db:prepare] Aplicando schema MySQL com Prisma db push...');

  try {
    runPrismaDbPush();
  } catch (error) {
    if (!shouldRetryWithAcceptDataLoss(error)) {
      throw error;
    }

    console.log('[db:prepare] Prisma solicitou --accept-data-loss. Reexecutando sincronizacao com confirmacao explicita.');
    runPrismaDbPush({ acceptDataLoss: true });
  }
}

main().catch((error) => {
  console.error('[db:prepare] falha ao sincronizar schema:', {
    code: error.code || 'UNKNOWN',
    errno: error.errno,
    sqlState: error.sqlState,
    sqlMessage: error.sqlMessage,
    message: error.message,
  });
  process.exit(1);
});
