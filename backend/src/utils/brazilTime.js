/**
 * Utilitário de horário Brasil (America/Sao_Paulo, UTC-3)
 * Resolve o problema de registros com horário errado quando o servidor
 * roda em UTC (padrão de servidores cloud).
 *
 * IMPORTANTE: usa aritmética UTC pura com offset -3h, sem depender de
 * suporte a ICU/locale no Node.js (ex: Alpine Linux slim não tem pt-BR).
 */

const TZ = 'America/Sao_Paulo';
const TZ_OFFSET_MS = -3 * 60 * 60 * 1000; // UTC-3

/**
 * Converte um Date para o equivalente no fuso de Brasília
 * retornando um Date cujos métodos UTC equivalem ao horário local BR.
 */
function toBrazilDate(date) {
  const d = new Date(date);
  return new Date(d.getTime() + TZ_OFFSET_MS);
}

function pad2(n) { return String(n).padStart(2, '0'); }

/**
 * Retorna o início do dia corrente no horário de Brasília como objeto Date UTC.
 */
function startOfTodayBR() {
  const brNow = toBrazilDate(new Date());
  const y = brNow.getUTCFullYear();
  const m = pad2(brNow.getUTCMonth() + 1);
  const d = pad2(brNow.getUTCDate());
  // Meia-noite em Brasília = 03:00 UTC (UTC-3 → +3h em UTC)
  return new Date(`${y}-${m}-${d}T00:00:00-03:00`);
}

/**
 * Retorna o fim do dia corrente no horário de Brasília como objeto Date UTC.
 */
function endOfTodayBR() {
  const brNow = toBrazilDate(new Date());
  const y = brNow.getUTCFullYear();
  const m = pad2(brNow.getUTCMonth() + 1);
  const d = pad2(brNow.getUTCDate());
  return new Date(`${y}-${m}-${d}T23:59:59.999-03:00`);
}

/**
 * Formata um timestamp (Date ou string) no fuso de Brasília.
 * Usa aritmética pura — sem Intl/locale — para compatibilidade máxima.
 * @param {Date|string} date
 * @param {string} format - 'HH:mm' | 'HH:mm:ss' | 'DD/MM/YYYY' | 'YYYY-MM-DD'
 */
function formatBR(date, format) {
  const br = toBrazilDate(new Date(date));
  const year  = br.getUTCFullYear();
  const month = pad2(br.getUTCMonth() + 1);
  const day   = pad2(br.getUTCDate());
  const hour  = pad2(br.getUTCHours());
  const min   = pad2(br.getUTCMinutes());
  const sec   = pad2(br.getUTCSeconds());

  switch (format) {
    case 'HH:mm':      return `${hour}:${min}`;
    case 'HH:mm:ss':   return `${hour}:${min}:${sec}`;
    case 'DD/MM/YYYY': return `${day}/${month}/${year}`;
    case 'YYYY-MM-DD': return `${year}-${month}-${day}`;
    default:           return `${day}/${month}/${year} ${hour}:${min}:${sec}`;
  }
}

/**
 * Retorna a data atual em Brasília no formato 'DD/MM/YYYY'.
 */
function todayBR() {
  return formatBR(new Date(), 'DD/MM/YYYY');
}

module.exports = { startOfTodayBR, endOfTodayBR, formatBR, todayBR, TZ };
