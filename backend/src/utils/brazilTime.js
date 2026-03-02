/**
 * Utilitário de horário Brasil (America/Sao_Paulo, UTC-3)
 * Resolve o problema de registros com horário errado quando o servidor
 * roda em UTC (padrão de servidores cloud).
 */

const TZ = 'America/Sao_Paulo';
const TZ_OFFSET_MS = -3 * 60 * 60 * 1000; // UTC-3

/**
 * Retorna o início do dia corrente no horário de Brasília como objeto Date UTC.
 */
function startOfTodayBR() {
  const now = new Date();
  // Data atual em Brasília
  const brDateStr = now.toLocaleDateString('en-CA', { timeZone: TZ }); // "YYYY-MM-DD"
  return new Date(brDateStr + 'T00:00:00-03:00');
}

/**
 * Retorna o fim do dia corrente no horário de Brasília como objeto Date UTC.
 */
function endOfTodayBR() {
  const now = new Date();
  const brDateStr = now.toLocaleDateString('en-CA', { timeZone: TZ });
  return new Date(brDateStr + 'T23:59:59.999-03:00');
}

/**
 * Formata um timestamp (Date ou string) no fuso de Brasília.
 * @param {Date|string} date
 * @param {string} format - 'HH:mm:ss' | 'DD/MM/YYYY' | 'YYYY-MM-DD' etc.
 */
function formatBR(date, format) {
  const d = new Date(date);
  const opts = { timeZone: TZ };

  if (format === 'HH:mm:ss') {
    return d.toLocaleTimeString('pt-BR', { ...opts, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  }
  if (format === 'DD/MM/YYYY') {
    return d.toLocaleDateString('pt-BR', { ...opts, day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  if (format === 'YYYY-MM-DD') {
    return d.toLocaleDateString('en-CA', { timeZone: TZ });
  }
  return d.toLocaleString('pt-BR', { timeZone: TZ });
}

/**
 * Retorna a data atual em Brasília no formato 'DD/MM/YYYY'.
 */
function todayBR() {
  return formatBR(new Date(), 'DD/MM/YYYY');
}

module.exports = { startOfTodayBR, endOfTodayBR, formatBR, todayBR, TZ };
