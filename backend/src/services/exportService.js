/**
 * Serviço de exportação de relatórios (PDF, Excel, CSV)
 * @module services/exportService
 */
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const dayjs = require('dayjs');

/**
 * Gera PDF do espelho de ponto individual
 * @param {Object} params - { employee, company, days, summary, period }
 * @returns {PDFDocument} stream do PDF
 */
function generatePunchMirrorPDF({ employee, company, days, summary, period }) {
  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });

  // ── Cabeçalho ──
  doc.fontSize(16).font('Helvetica-Bold').text(company.name, { align: 'center' });
  doc.fontSize(9).font('Helvetica').text(`CNPJ: ${formatCNPJDisplay(company.cnpj)}`, { align: 'center' });
  if (company.address) doc.text(company.address, { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(12).font('Helvetica-Bold').text('ESPELHO DE PONTO', { align: 'center' });
  doc.moveDown(0.3);

  // ── Dados do funcionário ──
  doc.fontSize(9).font('Helvetica');
  const infoY = doc.y;
  doc.text(`Funcionário: ${employee.name}`, 40, infoY);
  doc.text(`CPF: ${formatCPFDisplay(employee.cpf)}`, 300, infoY);
  doc.text(`Cargo: ${employee.position || '-'}`, 40, infoY + 14);
  doc.text(`Depto: ${employee.department || '-'}`, 300, infoY + 14);
  doc.text(`Período: ${period}`, 40, infoY + 28);
  doc.text(`Carga horária: ${employee.workloadHours}h/dia`, 300, infoY + 28);
  doc.moveDown(2);

  // ── Tabela ──
  const tableTop = doc.y;
  const colWidths = [62, 62, 70, 70, 62, 62, 65, 65];
  const headers = ['Data', 'Dia', 'Entrada', 'Almoço Ida', 'Almoço Volta', 'Saída', 'Total', 'Extra/Def.'];
  const tableLeft = 40;

  // Header
  doc.font('Helvetica-Bold').fontSize(7);
  let x = tableLeft;
  headers.forEach((h, i) => {
    doc.rect(x, tableTop, colWidths[i], 18).fill('#2563eb').stroke();
    doc.fillColor('#ffffff').text(h, x + 2, tableTop + 5, { width: colWidths[i] - 4, align: 'center' });
    x += colWidths[i];
  });

  // Rows
  doc.font('Helvetica').fontSize(7).fillColor('#000000');
  let y = tableTop + 18;
  const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  days.forEach((day, idx) => {
    if (y > 760) { doc.addPage(); y = 40; }
    const bg = idx % 2 === 0 ? '#f8fafc' : '#ffffff';
    x = tableLeft;
    const dateObj = dayjs(day.date, 'DD/MM/YYYY');
    const dayName = dayNames[dateObj.day()] || '-';
    const rowData = [day.date, dayName, day.clockIn || '-', day.breakStart || '-', day.breakEnd || '-', day.clockOut || '-', day.totalHours || '00:00', day.overtime || '-'];

    rowData.forEach((val, i) => {
      doc.rect(x, y, colWidths[i], 16).fill(bg).stroke('#e2e8f0');
      doc.fillColor('#1e293b').text(val, x + 2, y + 4, { width: colWidths[i] - 4, align: 'center' });
      x += colWidths[i];
    });
    y += 16;
  });

  // ── Resumo ──
  y += 10;
  if (y > 700) { doc.addPage(); y = 40; }
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#000000');
  doc.text('RESUMO', tableLeft, y);
  y += 16;
  doc.font('Helvetica').fontSize(8);
  const summaryItems = [
    ['Dias trabalhados:', `${summary.daysWorked}`],
    ['Dias úteis no mês:', `${summary.businessDays}`],
    ['Faltas:', `${summary.absences}`],
    ['Total trabalhado:', summary.totalWorked],
    ['Horas esperadas:', summary.expectedHours],
    ['Horas extras:', summary.overtime],
    ['Déficit:', summary.deficit],
  ];
  summaryItems.forEach(([label, value]) => {
    doc.font('Helvetica-Bold').text(label, tableLeft, y, { continued: true }).font('Helvetica').text(` ${value}`);
    y += 13;
  });

  // ── Assinaturas ──
  y += 30;
  if (y > 720) { doc.addPage(); y = 40; }
  doc.fontSize(8);
  doc.text('________________________________', 80, y, { align: 'left' });
  doc.text('________________________________', 350, y, { align: 'left' });
  y += 12;
  doc.text('Funcionário', 120, y);
  doc.text('Responsável RH', 390, y);

  // ── Rodapé ──
  doc.fontSize(6).fillColor('#94a3b8');
  doc.text(`Gerado por PontoDigital em ${dayjs().format('DD/MM/YYYY HH:mm')}`, 40, 810, { align: 'center', width: 515 });

  return doc;
}

/**
 * Gera Excel do relatório mensal
 * @param {Object} params - { employee, company, days, summary, period }
 * @returns {ExcelJS.Workbook}
 */
function generateMonthlyExcel({ employee, company, days, summary, period }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PontoDigital';
  wb.created = new Date();

  const ws = wb.addWorksheet('Espelho de Ponto');

  // Cabeçalho
  ws.mergeCells('A1:H1');
  ws.getCell('A1').value = company.name;
  ws.getCell('A1').font = { size: 14, bold: true };
  ws.getCell('A1').alignment = { horizontal: 'center' };

  ws.mergeCells('A2:H2');
  ws.getCell('A2').value = `CNPJ: ${formatCNPJDisplay(company.cnpj)}`;
  ws.getCell('A2').alignment = { horizontal: 'center' };

  ws.mergeCells('A3:H3');
  ws.getCell('A3').value = `ESPELHO DE PONTO - ${period}`;
  ws.getCell('A3').font = { size: 12, bold: true };
  ws.getCell('A3').alignment = { horizontal: 'center' };

  // Info funcionário
  ws.getCell('A5').value = `Funcionário: ${employee.name}`;
  ws.getCell('E5').value = `CPF: ${formatCPFDisplay(employee.cpf)}`;
  ws.getCell('A6').value = `Cargo: ${employee.position || '-'}`;
  ws.getCell('E6').value = `Depto: ${employee.department || '-'}`;

  // Headers tabela
  const headerRow = ws.getRow(8);
  const headers = ['Data', 'Dia', 'Entrada', 'Almoço Ida', 'Almoço Volta', 'Saída', 'Total Horas', 'Extra/Déficit'];
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    cell.alignment = { horizontal: 'center' };
    cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });

  // Dados
  const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  days.forEach((day, idx) => {
    const row = ws.getRow(9 + idx);
    const dateObj = dayjs(day.date, 'DD/MM/YYYY');
    const dayName = dayNames[dateObj.day()] || '-';
    [day.date, dayName, day.clockIn || '-', day.breakStart || '-', day.breakEnd || '-', day.clockOut || '-', day.totalHours || '00:00', day.overtime || '-'].forEach((val, i) => {
      const cell = row.getCell(i + 1);
      cell.value = val;
      cell.alignment = { horizontal: 'center' };
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      if (idx % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    });
  });

  // Resumo
  const summaryStart = 10 + days.length;
  ws.getCell(`A${summaryStart}`).value = 'RESUMO';
  ws.getCell(`A${summaryStart}`).font = { bold: true, size: 11 };

  const summaryData = [
    ['Dias trabalhados', summary.daysWorked],
    ['Dias úteis', summary.businessDays],
    ['Faltas', summary.absences],
    ['Total trabalhado', summary.totalWorked],
    ['Horas esperadas', summary.expectedHours],
    ['Horas extras', summary.overtime],
    ['Déficit', summary.deficit],
  ];
  summaryData.forEach(([label, value], i) => {
    ws.getCell(`A${summaryStart + 1 + i}`).value = label;
    ws.getCell(`A${summaryStart + 1 + i}`).font = { bold: true };
    ws.getCell(`B${summaryStart + 1 + i}`).value = value;
  });

  // Ajustar largura das colunas
  ws.columns.forEach(col => { col.width = 15; });

  return wb;
}

/**
 * Gera CSV do relatório
 * @param {Object} params - { employee, days, period }
 * @returns {string} conteúdo CSV
 */
function generateMonthlyCSV({ employee, days, period }) {
  const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const lines = [];
  lines.push(`Funcionário;${employee.name}`);
  lines.push(`CPF;${formatCPFDisplay(employee.cpf)}`);
  lines.push(`Período;${period}`);
  lines.push('');
  lines.push('Data;Dia;Entrada;Almoço Ida;Almoço Volta;Saída;Total Horas');

  days.forEach(day => {
    const dateObj = dayjs(day.date, 'DD/MM/YYYY');
    const dayName = dayNames[dateObj.day()] || '-';
    lines.push(`${day.date};${dayName};${day.clockIn || '-'};${day.breakStart || '-'};${day.breakEnd || '-'};${day.clockOut || '-'};${day.totalHours || '00:00'}`);
  });

  return lines.join('\n');
}

/* ── helpers de formatação ── */
function formatCPFDisplay(cpf) {
  if (!cpf) return '-';
  const c = cpf.replace(/\D/g, '');
  if (c.length !== 11) return cpf;
  return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`;
}

function formatCNPJDisplay(cnpj) {
  if (!cnpj) return '-';
  const c = cnpj.replace(/\D/g, '');
  if (c.length !== 14) return cnpj;
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}

module.exports = { generatePunchMirrorPDF, generateMonthlyExcel, generateMonthlyCSV };
