/**
 * Utilitário de integridade de dados — assinatura eletrônica via SHA-256
 * Garante imutabilidade dos registros de ponto.
 */
const crypto = require('crypto');

const INTEGRITY_SECRET = process.env.INTEGRITY_SECRET || process.env.JWT_SECRET || 'ponto-digital-integrity';

/**
 * Gera hash SHA-256 para um registro de ponto.
 * Inclui campos críticos que não devem ser alterados sem auditoria.
 */
function generateEntryHash(entry) {
  const payload = [
    entry.id,
    entry.employeeId,
    entry.type,
    new Date(entry.timestamp).toISOString(),
    entry.latitude || '',
    entry.longitude || '',
  ].join('|');

  return crypto
    .createHmac('sha256', INTEGRITY_SECRET)
    .update(payload)
    .digest('hex');
}

/**
 * Verifica se o hash de integridade de um registro ainda é válido.
 */
function verifyEntryHash(entry) {
  if (!entry.integrityHash) return { valid: false, reason: 'Sem hash de integridade' };
  const expected = generateEntryHash(entry);
  return {
    valid: entry.integrityHash === expected,
    reason: entry.integrityHash === expected ? 'OK' : 'Hash não confere — registro pode ter sido alterado'
  };
}

module.exports = { generateEntryHash, verifyEntryHash };
