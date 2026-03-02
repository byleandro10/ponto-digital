const prisma = require('../config/database');
const dayjs = require('dayjs');
const { checkGeofence } = require('../services/geofenceService');
const { calculateWorkedHours, calculateOvertime } = require('../utils/calculateHours');

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

    const today = dayjs().startOf('day').toDate();
    const tomorrow = dayjs().endOf('day').toDate();
    const todayEntries = await prisma.timeEntry.findMany({
      where: { employeeId, timestamp: { gte: today, lte: tomorrow } },
      orderBy: { timestamp: 'asc' }
    });
    let type;
    const types = todayEntries.map(e => e.type);
    if (!types.includes('CLOCK_IN')) type = 'CLOCK_IN';
    else if (!types.includes('BREAK_START')) type = 'BREAK_START';
    else if (!types.includes('BREAK_END')) type = 'BREAK_END';
    else if (!types.includes('CLOCK_OUT')) type = 'CLOCK_OUT';
    else return res.status(400).json({ error: 'Todos os pontos do dia já foram registrados.', entries: todayEntries });

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

        if (employee.company.geofenceMode === 'block' && geoResult.inside === false) {
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
      entry: { id: entry.id, type: entry.type, typeLabel: typeLabels[type], timestamp: entry.timestamp, latitude: entry.latitude, longitude: entry.longitude, address: entry.address }
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
    const today = dayjs().startOf('day').toDate();
    const tomorrow = dayjs().endOf('day').toDate();
    const entries = await prisma.timeEntry.findMany({
      where: { employeeId: req.employeeId, timestamp: { gte: today, lte: tomorrow } },
      orderBy: { timestamp: 'asc' }
    });
    const emp = await prisma.employee.findUnique({ where: { id: req.employeeId }, select: { hourBankBalance: true } });
    const typeLabels = { CLOCK_IN: 'Entrada', BREAK_START: 'Saída para Almoço', BREAK_END: 'Volta do Almoço', CLOCK_OUT: 'Saída' };
    const nextPunch = getNextPunchType(entries);
    res.json({
      date: dayjs().format('DD/MM/YYYY'),
      entries: entries.map(e => ({ ...e, typeLabel: typeLabels[e.type], time: dayjs(e.timestamp).format('HH:mm:ss') })),
      nextPunch: nextPunch ? typeLabels[nextPunch] : 'Dia completo',
      isComplete: !nextPunch,
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
      where.timestamp = { gte: new Date(startDate), lte: new Date(endDate + 'T23:59:59') };
    } else {
      where.timestamp = { gte: dayjs().subtract(30, 'day').startOf('day').toDate(), lte: dayjs().endOf('day').toDate() };
    }
    const entries = await prisma.timeEntry.findMany({ where, orderBy: { timestamp: 'asc' } });
    const grouped = {};
    entries.forEach(entry => {
      const day = dayjs(entry.timestamp).format('YYYY-MM-DD');
      if (!grouped[day]) grouped[day] = [];
      grouped[day].push(entry);
    });
    const { calculateWorkedHours } = require('../utils/calculateHours');
    const days = Object.entries(grouped).map(([date, dayEntries]) => {
      const worked = calculateWorkedHours(dayEntries);
      return {
        date: dayjs(date).format('DD/MM/YYYY'),
        entries: dayEntries.map(e => ({ type: e.type, time: dayjs(e.timestamp).format('HH:mm:ss'), address: e.address })),
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
    const today = dayjs().startOf('day').toDate();
    const tomorrow = dayjs().endOf('day').toDate();
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
        entries: entries.map(e => ({ type: e.type, time: dayjs(e.timestamp).format('HH:mm:ss') }))
      };
    });
    res.json({
      date: dayjs().format('DD/MM/YYYY'),
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

function getNextPunchType(entries) {
  const types = entries.map(e => e.type);
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
