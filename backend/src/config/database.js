const { PrismaClient } = require('@prisma/client');
const { getResolvedDatabaseUrl, getDatabaseDiagnostics } = require('./databaseConfig');

const databaseUrl = getResolvedDatabaseUrl();
process.env.DATABASE_URL = databaseUrl;
const diagnostics = getDatabaseDiagnostics();

const prismaLogLevels = ['error', 'warn'];
if (process.env.PRISMA_LOG_LEVEL === 'info') {
  prismaLogLevels.push('info');
}

console.log('[database] config:', {
  source: diagnostics.source,
  host: diagnostics.host,
  port: diagnostics.port,
  database: diagnostics.database,
  connectionLimit: diagnostics.connectionLimit,
  poolTimeout: diagnostics.poolTimeout,
  connectTimeout: diagnostics.connectTimeout,
  socket: diagnostics.socket || undefined,
  sslaccept: diagnostics.sslaccept || undefined,
});

// Singleton: reutilizar instancia em hot-reload (dev) e evitar exaustao de conexoes
const globalForPrisma = globalThis;
const prisma = globalForPrisma.__prisma || new PrismaClient({
  log: prismaLogLevels,
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__prisma = prisma;
}

module.exports = prisma;
