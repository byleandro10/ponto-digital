const prisma = require('../config/database');
const dayjs = require('dayjs');
const { calculateWorkedHours, calculateOvertime } = require('../utils/calculateHours');

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

module.exports = { getMonthlyReport, getDashboardStats };
