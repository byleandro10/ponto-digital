const path = require('path');
const { PrismaClient } = require('@prisma/client');

// Garantir que dotenv carrega do diretório correto do backend
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

// Singleton: reutilizar instância em hot-reload (dev) e evitar exaustão de conexões
const globalForPrisma = globalThis;
const prisma = globalForPrisma.__prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__prisma = prisma;
}

module.exports = prisma;
