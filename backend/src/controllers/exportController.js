/**
 * Controller de exportação de relatórios
 * @module controllers/exportController
 */
const prisma = require('../config/database');
const { calculateWorkedHours, calculateOvertime } = require('../utils/calculateHours');
const { generatePunchMirrorPDF, generateMonthlyExcel, generateMonthlyCSV } = require('../services/exportService');
const { formatBR, currentMonthBR, currentYearBR, startOfMonthBR, endOfMonthBR } = require('../utils/brazilTime');

/**
 * Monta os dados do relatório mensal (reutilizável)
 */
async function buildMonthlyData(employeeId, companyId, month, year) {
  const m = parseInt(month) || currentMonthBR();
  const y = parseInt(year) || currentYearBR();
  const startDate = startOfMonthBR(m, y);
  const endDate = endOfMonthBR(m, y);

  const employee = await prisma.employee.findFirst({ where: { id: employeeId, companyId } });
  if (!employee) return null;

  const company = await prisma.company.findUnique({ where: { id: companyId } });

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
    const dayOvertime = calculateOvertime(worked.totalMinutes, employee.workloadHours);
    return {
      date: formatBR(new Date(date + 'T12:00:00-03:00'), 'DD/MM/YYYY'),
      clockIn: getTime('CLOCK_IN'),
      breakStart: getTime('BREAK_START'),
      breakEnd: getTime('BREAK_END'),
      clockOut: getTime('CLOCK_OUT'),
      totalHours: worked.formatted,
      overtime: dayOvertime.overtimeMinutes > 0
        ? `+${dayOvertime.overtimeFormatted}`
        : dayOvertime.deficitMinutes > 0
          ? `-${dayOvertime.deficitFormatted}`
          : '00:00'
    };
  });

  const overtime = calculateOvertime(totalMinutesMonth, daysWorked * employee.workloadHours);
  // Conta dias úteis iterando pelo mês
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

  return {
    employee: { name: employee.name, cpf: employee.cpf, position: employee.position, department: employee.department, workloadHours: employee.workloadHours },
    company: { name: company.name, cnpj: company.cnpj, address: company.address },
    period: `${String(m).padStart(2, '0')}/${y}`,
    days,
    summary: {
      totalWorked: `${String(totalWorkedHours).padStart(2, '0')}:${String(totalWorkedMins).padStart(2, '0')}`,
      expectedHours: `${daysWorked * employee.workloadHours}:00`,
      overtime: overtime.overtimeFormatted,
      deficit: overtime.deficitFormatted,
      daysWorked,
      businessDays,
      absences: Math.max(0, businessDays - daysWorked)
    }
  };
}

/** Exportar PDF do espelho de ponto */
async function exportPDF(req, res) {
  try {
    const { employeeId } = req.params;
    const { month, year } = req.query;
    const data = await buildMonthlyData(employeeId, req.companyId, month, year);
    if (!data) return res.status(404).json({ error: 'Funcionário não encontrado.' });

    const doc = generatePunchMirrorPDF(data);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=espelho-ponto-${data.employee.name.replace(/\s+/g, '-')}-${data.period.replace('/', '-')}.pdf`);
    doc.pipe(res);
    doc.end();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao gerar PDF.' });
  }
}

/** Exportar Excel do espelho de ponto */
async function exportExcel(req, res) {
  try {
    const { employeeId } = req.params;
    const { month, year } = req.query;
    const data = await buildMonthlyData(employeeId, req.companyId, month, year);
    if (!data) return res.status(404).json({ error: 'Funcionário não encontrado.' });

    const wb = generateMonthlyExcel(data);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=espelho-ponto-${data.employee.name.replace(/\s+/g, '-')}-${data.period.replace('/', '-')}.xlsx`);
    await wb.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao gerar Excel.' });
  }
}

/** Exportar CSV do espelho de ponto */
async function exportCSV(req, res) {
  try {
    const { employeeId } = req.params;
    const { month, year } = req.query;
    const data = await buildMonthlyData(employeeId, req.companyId, month, year);
    if (!data) return res.status(404).json({ error: 'Funcionário não encontrado.' });

    const csv = generateMonthlyCSV(data);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=espelho-ponto-${data.employee.name.replace(/\s+/g, '-')}-${data.period.replace('/', '-')}.csv`);
    res.send('\uFEFF' + csv); // BOM para encoding correto no Excel
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao gerar CSV.' });
  }
}

/** Exportar relatório consolidado (todos os funcionários) em Excel */
async function exportConsolidated(req, res) {
  try {
    const { month, year } = req.query;
    const m = parseInt(month) || currentMonthBR();
    const y = parseInt(year) || currentYearBR();

    const employees = await prisma.employee.findMany({
      where: { companyId: req.companyId, active: true },
      orderBy: { name: 'asc' }
    });

    const company = await prisma.company.findUnique({ where: { id: req.companyId } });
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    wb.creator = 'PontoDigital';

    // Planilha resumo
    const summary = wb.addWorksheet('Resumo');
    summary.mergeCells('A1:G1');
    summary.getCell('A1').value = `${company.name} - Relatório Consolidado ${String(m).padStart(2, '0')}/${y}`;
    summary.getCell('A1').font = { size: 14, bold: true };
    summary.getCell('A1').alignment = { horizontal: 'center' };

    const headerRow = summary.getRow(3);
    ['Funcionário', 'CPF', 'Cargo', 'Dias Trab.', 'Total Horas', 'Extras', 'Déficit'].forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
      cell.alignment = { horizontal: 'center' };
    });

    for (let idx = 0; idx < employees.length; idx++) {
      const data = await buildMonthlyData(employees[idx].id, req.companyId, month, year);
      if (!data) continue;
      const row = summary.getRow(4 + idx);
      [data.employee.name, data.employee.cpf, data.employee.position || '-',
       data.summary.daysWorked, data.summary.totalWorked, data.summary.overtime, data.summary.deficit
      ].forEach((val, i) => {
        const cell = row.getCell(i + 1);
        cell.value = val;
        cell.alignment = { horizontal: 'center' };
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      });
    }

    summary.columns.forEach(col => { col.width = 18; });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=consolidado-${String(m).padStart(2, '0')}-${y}.xlsx`);
    await wb.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao gerar relatório consolidado.' });
  }
}

module.exports = { exportPDF, exportExcel, exportCSV, exportConsolidated };
