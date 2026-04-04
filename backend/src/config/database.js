const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { PrismaMariaDb } = require('@prisma/adapter-mariadb');

// Garantir que dotenv carrega do diretorio correto do backend
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL nao configurada.');
}

// Usa o driver JavaScript do MariaDB/MySQL para evitar o engine Rust no runtime da Hostinger.
const adapter = new PrismaMariaDb(databaseUrl, {
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
