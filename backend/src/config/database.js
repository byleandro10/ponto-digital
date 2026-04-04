const { PrismaClient } = require('@prisma/client');
const { PrismaMariaDb } = require('@prisma/adapter-mariadb');
const { getMariaDbConfig } = require('./databaseConfig');

const { databaseUrl, config } = getMariaDbConfig();
process.env.DATABASE_URL = databaseUrl;

// Usa o driver JavaScript do MariaDB/MySQL para evitar o engine Rust no runtime da Hostinger.
const adapter = new PrismaMariaDb(config, {
  database: config.database,
  onConnectionError: (error) => {
    console.error('[database] connection error:', error.message);
  },
});

// Singleton: reutilizar instancia em hot-reload (dev) e evitar exaustao de conexoes
const globalForPrisma = globalThis;
const prisma = globalForPrisma.__prisma || new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__prisma = prisma;
}

module.exports = prisma;
