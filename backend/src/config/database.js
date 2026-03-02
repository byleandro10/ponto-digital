const path = require('path');
const { PrismaClient } = require('@prisma/client');

// Garantir que dotenv carrega do diretório correto do backend
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

let prisma;

if (!prisma) {
  prisma = new PrismaClient();
}

module.exports = prisma;
