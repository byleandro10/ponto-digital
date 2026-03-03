/**
 * Controller de autoatendimento do funcionário
 * Espelho de ponto, log de alterações, verificação de integridade
 * @module controllers/employeeSelfServiceController
 */
const prisma = require('../config/database');
const { calculateWorkedHours, calculateOvertime } = require('../utils/calculateHours');
const { formatBR, currentMonthBR, currentYearBR, startOfMonthBR, endOfMonthBR } = require('../utils/brazilTime');
const { verifyEntryHash } = require('../utils/integrity');

/**
 * Espelho de ponto do funcionário (mensal)
 * Retorna os mesmos dados que o getMonthlyReport mas para o próprio funcionário
 */
async function getMyPunchMirror(req, res) {
  try {
    const employeeId = req.employeeId;
    const { month, year } = req.query;
    const m = parseInt(month) || currentMonthBR();
    const y = parseInt(year) || currentYearBR();
    const startDate = startOfMonthBR(m, y);
    const endDate = endOfMonthBR(m, y);

    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) return res.status(404).json({ error: 'Funcionário não encontrado.' });

    const entries = await prisma.timeEntry.findMany({
      where: { employeeId, timestamp: { gte: startDate, lte: endDate } },
      orderBy: { timestamp: 'asc' }
    });

    const grouped = {};
    entries.forEach(entry => {
      const day = formatBR(entry.timestamp, 'YYYY-MM-DD');
      if (!grouped[day]) grouped[day] = [];
      grouped[day].push(entry);
    });

    let totalMinutesMonth = 0;
    let daysWorked = 0;
    const days = Object.entries(grouped).map(([date, dayEntries]) => {
      const worked = calculateWorkedHours(dayEntries);
      totalMinutesMonth += worked.totalMinutes;
      daysWorked++;
      const getTime = (type) => {
        const e = dayEntries.find(x => x.type === type);
        return e ? formatBR(e.timestamp, 'HH:mm') : null;
      };
      return {
        date: formatBR(new Date(date + 'T12:00:00-03:00'), 'DD/MM/YYYY'),
        clockIn: getTime('CLOCK_IN'),
        breakStart: getTime('BREAK_START'),
        breakEnd: getTime('BREAK_END'),
        clockOut: getTime('CLOCK_OUT'),
        totalHours: worked.formatted,
        hasAdjustment: dayEntries.some(e => !!e.adjustedBy),
        entries: dayEntries.map(e => ({
          id: e.id,
          type: e.type,
          time: formatBR(e.timestamp, 'HH:mm:ss'),
          adjusted: !!e.adjustedBy,
          adjustmentNote: e.adjustmentNote || null,
          originalTime: e.originalTimestamp ? formatBR(e.originalTimestamp, 'HH:mm:ss') : null,
          integrityValid: e.integrityHash ? verifyEntryHash(e).valid : null
        }))
      };
    });

    const overtime = calculateOvertime(totalMinutesMonth, daysWorked * employee.workloadHours);

    // Conta dias úteis
    let businessDays = 0;
    const msPerDay = 86400000;
    let cur = new Date(startDate.getTime());
    while (cur <= endDate) {
      const brDay = new Date(cur.getTime() + (-3 * 60 * 60 * 1000));
      const dow = brDay.getUTCDay();
      if (dow !== 0 && dow !== 6) businessDays++;
      cur = new Date(cur.getTime() + msPerDay);
    }

    const totalWorkedHours = Math.floor(totalMinutesMonth / 60);
    const totalWorkedMins = totalMinutesMonth % 60;

    res.json({
      employee: { name: employee.name, cpf: employee.cpf, position: employee.position, department: employee.department, workloadHours: employee.workloadHours },
      period: `${String(m).padStart(2, '0')}/${y}`,
      days,
      summary: {
        totalWorked: `${String(totalWorkedHours).padStart(2, '0')}:${String(totalWorkedMins).padStart(2, '0')}`,
        expectedHours: `${daysWorked * employee.workloadHours}:00`,
        overtime: overtime.overtimeFormatted,
        deficit: overtime.deficitFormatted,
        daysWorked,
        businessDays,
        absences: Math.max(0, businessDays - daysWorked),
        hourBankBalance: employee.hourBankBalance
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao gerar espelho de ponto.' });
  }
}

/**
 * Log de alterações feitas nos registros do funcionário
 */
async function getMyAuditLog(req, res) {
  try {
    const employeeId = req.employeeId;

    const logs = await prisma.timeAdjustmentLog.findMany({
      where: { employeeId },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    const formatted = logs.map(log => {
      let oldParsed = null;
      let newParsed = null;
      try { oldParsed = log.oldValue ? JSON.parse(log.oldValue) : null; } catch {}
      try { newParsed = log.newValue ? JSON.parse(log.newValue) : null; } catch {}

      return {
        id: log.id,
        action: log.action,
        reason: log.reason,
        date: formatBR(log.createdAt, 'DD/MM/YYYY'),
        time: formatBR(log.createdAt, 'HH:mm'),
        oldTime: oldParsed?.timestamp ? formatBR(new Date(oldParsed.timestamp), 'HH:mm:ss') : null,
        oldDate: oldParsed?.timestamp ? formatBR(new Date(oldParsed.timestamp), 'DD/MM/YYYY') : null,
        oldType: oldParsed?.type || null,
        newTime: newParsed?.timestamp ? formatBR(new Date(newParsed.timestamp), 'HH:mm:ss') : null,
        newDate: newParsed?.timestamp ? formatBR(new Date(newParsed.timestamp), 'DD/MM/YYYY') : null,
        newType: newParsed?.type || null,
      };
    });

    res.json({ logs: formatted, total: formatted.length });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar log de alterações.' });
  }
}

module.exports = { getMyPunchMirror, getMyAuditLog };
