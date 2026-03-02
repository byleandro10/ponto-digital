const prisma = require('../config/database');
const dayjs = require('dayjs');
const { calculateWorkedHours, calculateOvertime } = require('../utils/calculateHours');
const { startOfTodayBR, endOfTodayBR, formatBR } = require('../utils/brazilTime');
const { haversineDistance } = require('../services/geofenceService');

async function getMonthlyReport(req, res) {
  try {
    const { employeeId } = req.params;
    const { month, year } = req.query;
    const m = parseInt(month) || dayjs().month() + 1;
    const y = parseInt(year) || dayjs().year();
    const startDate = dayjs(`${y}-${String(m).padStart(2, '0')}-01`).startOf('month').toDate();
    const endDate = dayjs(startDate).endOf('month').toDate();
    const employee = await prisma.employee.findFirst({ where: { id: employeeId, companyId: req.companyId } });
    if (!employee) return res.status(404).json({ error: 'Funcionário não encontrado.' });
    const entries = await prisma.timeEntry.findMany({
      where: { employeeId, timestamp: { gte: startDate, lte: endDate } },
      orderBy: { timestamp: 'asc' }
    });
    const grouped = {};
    entries.forEach(entry => {
      const day = dayjs(entry.timestamp).format('YYYY-MM-DD');
      if (!grouped[day]) grouped[day] = [];
      grouped[day].push(entry);
    });
    let totalMinutesMonth = 0;
    let daysWorked = 0;
    const days = Object.entries(grouped).map(([date, dayEntries]) => {
      const worked = calculateWorkedHours(dayEntries);
      totalMinutesMonth += worked.totalMinutes;
      daysWorked++;
      const getTime = (type) => { const e = dayEntries.find(x => x.type === type); return e ? dayjs(e.timestamp).format('HH:mm') : null; };
      return { date: dayjs(date).format('DD/MM/YYYY'), clockIn: getTime('CLOCK_IN'), breakStart: getTime('BREAK_START'), breakEnd: getTime('BREAK_END'), clockOut: getTime('CLOCK_OUT'), totalHours: worked.formatted };
    });
    const overtime = calculateOvertime(totalMinutesMonth, daysWorked * employee.workloadHours);
    let businessDays = 0;
    let current = dayjs(startDate);
    while (current.isBefore(endDate) || current.isSame(endDate, 'day')) {
      const dow = current.day();
      if (dow !== 0 && dow !== 6) businessDays++;
      current = current.add(1, 'day');
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
        daysWorked, businessDays,
        absences: Math.max(0, businessDays - daysWorked)
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao gerar relatório.' });
  }
}

async function getDashboardStats(req, res) {
  try {
    const today = dayjs().startOf('day').toDate();
    const tomorrow = dayjs().endOf('day').toDate();
    const monthStart = dayjs().startOf('month').toDate();
    const totalEmployees = await prisma.employee.count({ where: { companyId: req.companyId, active: true } });
    const todayEntries = await prisma.timeEntry.findMany({
      where: { employee: { companyId: req.companyId }, timestamp: { gte: today, lte: tomorrow } },
      include: { employee: true }
    });
    const presentToday = new Set(todayEntries.map(e => e.employeeId)).size;
    const monthEntries = await prisma.timeEntry.count({
      where: { employee: { companyId: req.companyId }, timestamp: { gte: monthStart, lte: tomorrow } }
    });
    res.json({
      totalEmployees, presentToday, absentToday: totalEmployees - presentToday,
      totalEntriesThisMonth: monthEntries,
      date: dayjs().format('DD/MM/YYYY'), time: dayjs().format('HH:mm:ss')
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar estatísticas.' });
  }
}

module.exports = { getMonthlyReport, getDashboardStats, getPunchMapData };

/**
 * Retorna todos os registros de ponto com coordenadas GPS para visualização no mapa.
 * Suporta filtros: date (YYYY-MM-DD), employeeId.
 * Inclui distância calculada até a cerca mais próxima.
 */
async function getPunchMapData(req, res) {
  try {
    const { date, employeeId } = req.query;

    // Define janela de tempo
    let start, end;
    if (date) {
      start = new Date(date + 'T00:00:00-03:00');
      end   = new Date(date + 'T23:59:59.999-03:00');
    } else {
      start = startOfTodayBR();
      end   = endOfTodayBR();
    }

    const where = {
      employee: { companyId: req.companyId },
      timestamp: { gte: start, lte: end },
    };
    if (employeeId) where.employeeId = employeeId;

    const entries = await prisma.timeEntry.findMany({
      where,
      orderBy: { timestamp: 'asc' },
      include: { employee: { select: { name: true, position: true, department: true } } }
    });

    // Busca cercas da empresa para calcular distância
    const geofences = await prisma.geofence.findMany({
      where: { companyId: req.companyId, active: true }
    });

    const TYPE_LABELS = {
      CLOCK_IN: 'Entrada',
      BREAK_START: 'Saída Almoço',
      BREAK_END: 'Volta Almoço',
      CLOCK_OUT: 'Saída'
    };

    const TYPE_COLORS = {
      CLOCK_IN: '#16a34a',
      BREAK_START: '#ca8a04',
      BREAK_END: '#2563eb',
      CLOCK_OUT: '#dc2626'
    };

    const markers = entries
      .filter(e => e.latitude != null && e.longitude != null)
      .map(e => {
        // Calcula distância até a cerca mais próxima
        let nearestFence = null;
        let nearestDistance = null;
        if (geofences.length > 0) {
          let minDist = Infinity;
          for (const fence of geofences) {
            const dist = haversineDistance(e.latitude, e.longitude, fence.latitude, fence.longitude);
            if (dist < minDist) {
              minDist = dist;
              nearestFence = fence;
            }
          }
          nearestDistance = Math.round(minDist);
        }

        const isInside = nearestFence
          ? nearestDistance <= nearestFence.radius
          : null;

        return {
          id: e.id,
          employeeName: e.employee.name,
          employeePosition: e.employee.position,
          type: e.type,
          typeLabel: TYPE_LABELS[e.type] || e.type,
          color: TYPE_COLORS[e.type] || '#6b7280',
          time: formatBR(e.timestamp, 'HH:mm:ss'),
          timestamp: e.timestamp,
          latitude: e.latitude,
          longitude: e.longitude,
          address: e.address || null,
          photo: e.photo || null,
          insideGeofence: e.insideGeofence ?? isInside,
          geofenceName: e.geofenceName || nearestFence?.name || null,
          distanceFromFence: nearestDistance,
          fenceRadius: nearestFence?.radius || null,
          notes: e.notes || null
        };
      });

    // Agrupa por funcionário para estatísticas
    const byEmployee = {};
    markers.forEach(m => {
      if (!byEmployee[m.employeeName]) byEmployee[m.employeeName] = [];
      byEmployee[m.employeeName].push(m);
    });

    res.json({
      date: date || formatBR(new Date(), 'DD/MM/YYYY'),
      markers,
      geofences: geofences.map(f => ({
        id: f.id,
        name: f.name,
        latitude: f.latitude,
        longitude: f.longitude,
        radius: f.radius,
        active: f.active
      })),
      totalWithLocation: markers.length,
      totalWithoutLocation: entries.length - markers.length,
      byEmployee
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar dados do mapa.' });
  }
}
