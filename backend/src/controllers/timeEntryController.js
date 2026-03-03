const prisma = require('../config/database');
const { checkGeofence } = require('../services/geofenceService');
const { calculateWorkedHours, calculateOvertime } = require('../utils/calculateHours');
const { startOfTodayBR, endOfTodayBR, formatBR, todayBR } = require('../utils/brazilTime');
const { generateEntryHash } = require('../utils/integrity');

async function clockPunch(req, res) {
  try {
    const { latitude, longitude, address, deviceInfo, photo, notes } = req.body;
    const employeeId = req.employeeId;

    // Buscar empresa e configuração
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { company: true }
    });

    // Verificar selfie obrigatória
    if (employee.company.requireSelfie && !photo) {
      return res.status(400).json({ error: 'Foto (selfie) é obrigatória para bater ponto.' });
    }

    const today = startOfTodayBR();
    const tomorrow = endOfTodayBR();
    const todayEntries = await prisma.timeEntry.findMany({
      where: { employeeId, timestamp: { gte: today, lte: tomorrow } },
      orderBy: { timestamp: 'asc' }
    });

    // Determina próximo tipo com base na jornada do funcionário
    let type;
    const types = todayEntries.map(e => e.type);
    const schedule = employee.workScheduleType || 'standard';

    if (schedule === 'no_break') {
      // Jornada sem intervalo: apenas CLOCK_IN → CLOCK_OUT
      if (!types.includes('CLOCK_IN')) type = 'CLOCK_IN';
      else if (!types.includes('CLOCK_OUT')) type = 'CLOCK_OUT';
      else return res.status(400).json({ error: 'Todos os pontos do dia já foram registrados.' });
    } else if (schedule === 'shift') {
      // Escala: pares CLOCK_IN / CLOCK_OUT ilimitados (ex: 12x36)
      const lastEntry = todayEntries[todayEntries.length - 1];
      if (!lastEntry || lastEntry.type === 'CLOCK_OUT') type = 'CLOCK_IN';
      else type = 'CLOCK_OUT';
    } else {
      // standard: CLOCK_IN → BREAK_START → BREAK_END → CLOCK_OUT
      if (!types.includes('CLOCK_IN')) type = 'CLOCK_IN';
      else if (!types.includes('BREAK_START')) type = 'BREAK_START';
      else if (!types.includes('BREAK_END')) type = 'BREAK_END';
      else if (!types.includes('CLOCK_OUT')) type = 'CLOCK_OUT';
      else return res.status(400).json({ error: 'Todos os pontos do dia já foram registrados.', entries: todayEntries });
    }

    // Geofencing
    let insideGeofence = null;
    let geofenceName = null;
    if (employee.company.geofenceMode !== 'off' && latitude && longitude) {
      const fences = await prisma.geofence.findMany({
        where: { companyId: employee.companyId, active: true }
      });
      if (fences.length > 0) {
        const geoResult = checkGeofence(latitude, longitude, fences);
        insideGeofence = geoResult.inside;
        geofenceName = geoResult.fence?.name || null;

        // Bloqueia apenas se: modo=block E fora da cerca E funcionário NÃO é isento
        if (employee.company.geofenceMode === 'block' && geoResult.inside === false && !employee.geofenceExempt) {
          return res.status(403).json({
            error: `Você está fora da área permitida (${geoResult.distance}m da cerca "${geoResult.fence?.name}"). Ponto bloqueado.`,
            distance: geoResult.distance,
            fence: geoResult.fence?.name
          });
        }
      }
    }

    const entry = await prisma.timeEntry.create({
      data: { employeeId, type, latitude, longitude, address, deviceInfo, photo, notes, insideGeofence, geofenceName }
    });

    // Gerar hash de integridade (assinatura eletrônica)
    const integrityHash = generateEntryHash(entry);
    await prisma.timeEntry.update({
      where: { id: entry.id },
      data: { integrityHash }
    });

    // Banco de horas: calcular saldo ao registrar CLOCK_OUT
    if (type === 'CLOCK_OUT') {
      const allEntries = [...todayEntries, entry];
      const worked = calculateWorkedHours(allEntries);
      const overtime = calculateOvertime(worked.totalMinutes, employee.workloadHours);
      // Positivo = hora extra, negativo = déficit
      const balanceDelta = overtime.overtimeMinutes > 0 ? overtime.overtimeMinutes : -overtime.deficitMinutes;
      await prisma.employee.update({
        where: { id: employeeId },
        data: { hourBankBalance: { increment: balanceDelta } }
      });
    }

    const typeLabels = { CLOCK_IN: 'Entrada', BREAK_START: 'Saída para Almoço', BREAK_END: 'Volta do Almoço', CLOCK_OUT: 'Saída' };

    const responseData = {
      message: `${typeLabels[type]} registrada com sucesso!`,
      entry: { id: entry.id, type: entry.type, typeLabel: typeLabels[type], timestamp: entry.timestamp, latitude: entry.latitude, longitude: entry.longitude, address: entry.address, time: formatBR(entry.timestamp, 'HH:mm:ss') }
    };
    if (insideGeofence === false) {
      responseData.warning = `Ponto registrado fora da cerca virtual "${geofenceName}".`;
    }

    res.status(201).json(responseData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao registrar ponto.' });
  }
}

async function getTodayEntries(req, res) {
  try {
    const today = startOfTodayBR();
    const tomorrow = endOfTodayBR();
    const entries = await prisma.timeEntry.findMany({
      where: { employeeId: req.employeeId, timestamp: { gte: today, lte: tomorrow } },
      orderBy: { timestamp: 'asc' }
    });
    const emp = await prisma.employee.findUnique({
      where: { id: req.employeeId },
      select: { hourBankBalance: true, workScheduleType: true }
    });
    const schedule = emp?.workScheduleType || 'standard';
    const typeLabels = { CLOCK_IN: 'Entrada', BREAK_START: 'Saída para Almoço', BREAK_END: 'Volta do Almoço', CLOCK_OUT: 'Saída' };
    const nextPunch = getNextPunchType(entries, schedule);
    res.json({
      date: todayBR(),
      entries: entries.map(e => ({ ...e, typeLabel: typeLabels[e.type], time: formatBR(e.timestamp, 'HH:mm:ss') })),
      nextPunch: nextPunch ? typeLabels[nextPunch] : 'Dia completo',
      isComplete: !nextPunch,
      workScheduleType: schedule,
      hourBankBalance: emp?.hourBankBalance || 0
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar registros.' });
  }
}

async function getHistory(req, res) {
  try {
    const { startDate, endDate } = req.query;
    const employeeId = req.employeeId || req.params.employeeId;
    const where = { employeeId };
    if (startDate && endDate) {
      // Interpreta as datas no fuso de Brasília
      where.timestamp = {
        gte: new Date(startDate + 'T00:00:00-03:00'),
        lte: new Date(endDate + 'T23:59:59.999-03:00')
      };
    } else {
      // Fallback: últimos 30 dias a partir de hoje no fuso BR
      const { startOfDayBR, endOfTodayBR: endBR } = require('../utils/brazilTime');
      const now = new Date();
      const thirtyAgo = new Date(now.getTime() - 30 * 86400000);
      const brThirtyAgo = new Date(thirtyAgo.getTime() + (-3 * 60 * 60 * 1000));
      const y = brThirtyAgo.getUTCFullYear();
      const m = String(brThirtyAgo.getUTCMonth() + 1).padStart(2, '0');
      const d = String(brThirtyAgo.getUTCDate()).padStart(2, '0');
      where.timestamp = {
        gte: new Date(`${y}-${m}-${d}T00:00:00-03:00`),
        lte: endOfTodayBR()
      };
    }
    const entries = await prisma.timeEntry.findMany({ where, orderBy: { timestamp: 'asc' } });
    const grouped = {};
    entries.forEach(entry => {
      const day = formatBR(entry.timestamp, 'YYYY-MM-DD');
      if (!grouped[day]) grouped[day] = [];
      grouped[day].push(entry);
    });
    const { calculateWorkedHours } = require('../utils/calculateHours');
    const days = Object.entries(grouped).map(([date, dayEntries]) => {
      const worked = calculateWorkedHours(dayEntries);
      return {
        date: formatBR(new Date(date + 'T12:00:00-03:00'), 'DD/MM/YYYY'),
        entries: dayEntries.map(e => ({ id: e.id, type: e.type, time: formatBR(e.timestamp, 'HH:mm:ss'), address: e.address })),
        totalWorked: worked.formatted
      };
    });
    res.json({ days, totalDays: days.length });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar histórico.' });
  }
}

async function getAllTodayEntries(req, res) {
  try {
    const today = startOfTodayBR();
    const tomorrow = endOfTodayBR();
    const employees = await prisma.employee.findMany({
      where: { companyId: req.companyId, active: true },
      include: { timeEntries: { where: { timestamp: { gte: today, lte: tomorrow } }, orderBy: { timestamp: 'asc' } } },
      orderBy: { name: 'asc' }
    });
    const summary = employees.map(emp => {
      const entries = emp.timeEntries;
      const status = getEmployeeStatus(entries);
      return {
        id: emp.id, name: emp.name, position: emp.position, department: emp.department, status,
        entries: entries.map(e => ({ type: e.type, time: formatBR(e.timestamp, 'HH:mm:ss') }))
      };
    });
    res.json({
      date: todayBR(),
      employees: summary,
      stats: {
        total: employees.length,
        present: summary.filter(s => s.status !== 'Ausente').length,
        absent: summary.filter(s => s.status === 'Ausente').length,
        onBreak: summary.filter(s => s.status === 'Em Almoço').length
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar registros.' });
  }
}

function getNextPunchType(entries, schedule = 'standard') {
  const types = entries.map(e => e.type);
  if (schedule === 'no_break') {
    if (!types.includes('CLOCK_IN')) return 'CLOCK_IN';
    if (!types.includes('CLOCK_OUT')) return 'CLOCK_OUT';
    return null;
  }
  if (schedule === 'shift') {
    const last = entries[entries.length - 1];
    if (!last || last.type === 'CLOCK_OUT') return 'CLOCK_IN';
    return 'CLOCK_OUT';
  }
  // standard
  if (!types.includes('CLOCK_IN')) return 'CLOCK_IN';
  if (!types.includes('BREAK_START')) return 'BREAK_START';
  if (!types.includes('BREAK_END')) return 'BREAK_END';
  if (!types.includes('CLOCK_OUT')) return 'CLOCK_OUT';
  return null;
}

function getEmployeeStatus(entries) {
  const types = entries.map(e => e.type);
  if (types.length === 0) return 'Ausente';
  if (types.includes('CLOCK_OUT')) return 'Saiu';
  if (types.includes('BREAK_START') && !types.includes('BREAK_END')) return 'Em Almoço';
  if (types.includes('CLOCK_IN')) return 'Trabalhando';
  return 'Ausente';
}

module.exports = { clockPunch, getTodayEntries, getHistory, getAllTodayEntries };
