const { execSync } = require('child_process');
const { getResolvedDatabaseUrl } = require('../src/config/databaseConfig');

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
  console.log('[db:prepare] DATABASE_URL não é MySQL. Pulando bootstrap do schema.');
  process.exit(0);
}

console.log('[db:prepare] Aplicando schema MySQL com Prisma db push...');
execSync('npx prisma db push --skip-generate --schema=backend/prisma/schema.prisma', {
  stdio: 'inherit',
});
