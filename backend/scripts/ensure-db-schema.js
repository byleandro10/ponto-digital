const { execSync } = require('child_process');

const databaseUrl = process.env.DATABASE_URL || '';

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
