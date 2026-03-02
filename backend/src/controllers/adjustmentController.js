/**
 * Controller de ajustes de ponto
 * @module controllers/adjustmentController
 */
const prisma = require('../config/database');
const dayjs = require('dayjs');

/** Editar horário de um registro de ponto */
async function editTimeEntry(req, res) {
  try {
    const { entryId } = req.params;
    const { newTimestamp, reason } = req.body;

    if (!reason || reason.trim().length < 5) {
      return res.status(400).json({ error: 'Justificativa obrigatória (mínimo 5 caracteres).' });
    }
    if (!newTimestamp) {
      return res.status(400).json({ error: 'Novo horário é obrigatório.' });
    }

    const entry = await prisma.timeEntry.findUnique({
      where: { id: entryId },
      include: { employee: true }
    });
    if (!entry) return res.status(404).json({ error: 'Registro não encontrado.' });
    if (entry.employee.companyId !== req.companyId) {
      return res.status(403).json({ error: 'Sem permissão para este registro.' });
    }

    const oldTimestamp = entry.timestamp;
    const parsedNew = new Date(newTimestamp);
    if (isNaN(parsedNew.getTime())) {
      return res.status(400).json({ error: 'Horário inválido.' });
    }

    // Atualizar entry
    await prisma.timeEntry.update({
      where: { id: entryId },
      data: {
        timestamp: parsedNew,
        adjustedBy: req.userId,
        adjustedAt: new Date(),
        adjustmentNote: reason.trim(),
        originalTimestamp: entry.originalTimestamp || oldTimestamp
      }
    });

    // Log de auditoria
    await prisma.timeAdjustmentLog.create({
      data: {
        employeeId: entry.employeeId,
        entryId,
        action: 'EDIT',
        oldValue: JSON.stringify({ timestamp: oldTimestamp, type: entry.type }),
        newValue: JSON.stringify({ timestamp: parsedNew, type: entry.type }),
        reason: reason.trim(),
        adjustedBy: req.userId
      }
    });

    res.json({ message: 'Ponto ajustado com sucesso.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao ajustar ponto.' });
  }
}

/** Adicionar registro de ponto faltante */
async function addTimeEntry(req, res) {
  try {
    const { employeeId, type, timestamp, reason } = req.body;

    if (!employeeId || !type || !timestamp || !reason) {
      return res.status(400).json({ error: 'Funcionário, tipo, horário e justificativa são obrigatórios.' });
    }
    if (reason.trim().length < 5) {
      return res.status(400).json({ error: 'Justificativa deve ter no mínimo 5 caracteres.' });
    }
    const validTypes = ['CLOCK_IN', 'BREAK_START', 'BREAK_END', 'CLOCK_OUT'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Tipo inválido.' });
    }

    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, companyId: req.companyId }
    });
    if (!employee) return res.status(404).json({ error: 'Funcionário não encontrado.' });

    const parsedTimestamp = new Date(timestamp);
    if (isNaN(parsedTimestamp.getTime())) {
      return res.status(400).json({ error: 'Horário inválido.' });
    }

    const entry = await prisma.timeEntry.create({
      data: {
        employeeId,
        type,
        timestamp: parsedTimestamp,
        adjustedBy: req.userId,
        adjustedAt: new Date(),
        adjustmentNote: reason.trim(),
        notes: 'Registro adicionado pelo administrador'
      }
    });

    await prisma.timeAdjustmentLog.create({
      data: {
        employeeId,
        entryId: entry.id,
        action: 'ADD',
        newValue: JSON.stringify({ timestamp: parsedTimestamp, type }),
        reason: reason.trim(),
        adjustedBy: req.userId
      }
    });

    res.status(201).json({ message: 'Registro adicionado com sucesso.', entry });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao adicionar registro.' });
  }
}

/** Excluir registro duplicado */
async function deleteTimeEntry(req, res) {
  try {
    const { entryId } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim().length < 5) {
      return res.status(400).json({ error: 'Justificativa obrigatória (mínimo 5 caracteres).' });
    }

    const entry = await prisma.timeEntry.findUnique({
      where: { id: entryId },
      include: { employee: true }
    });
    if (!entry) return res.status(404).json({ error: 'Registro não encontrado.' });
    if (entry.employee.companyId !== req.companyId) {
      return res.status(403).json({ error: 'Sem permissão.' });
    }

    await prisma.timeAdjustmentLog.create({
      data: {
        employeeId: entry.employeeId,
        entryId,
        action: 'DELETE',
        oldValue: JSON.stringify({ timestamp: entry.timestamp, type: entry.type }),
        reason: reason.trim(),
        adjustedBy: req.userId
      }
    });

    await prisma.timeEntry.delete({ where: { id: entryId } });

    res.json({ message: 'Registro removido com sucesso.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao remover registro.' });
  }
}

/** Listar log de ajustes */
async function listAdjustments(req, res) {
  try {
    const { employeeId } = req.query;
    const where = {};
    if (employeeId) {
      const emp = await prisma.employee.findFirst({ where: { id: employeeId, companyId: req.companyId } });
      if (!emp) return res.status(404).json({ error: 'Funcionário não encontrado.' });
      where.employeeId = employeeId;
    } else {
      // Todos os logs da empresa
      const empIds = await prisma.employee.findMany({
        where: { companyId: req.companyId },
        select: { id: true }
      });
      where.employeeId = { in: empIds.map(e => e.id) };
    }

    const logs = await prisma.timeAdjustmentLog.findMany({
      where,
      include: { employee: { select: { name: true, cpf: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    res.json({ logs, total: logs.length });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar log de ajustes.' });
  }
}

/** Buscar registros de ponto de um funcionário em uma data específica */
async function getEntriesByDate(req, res) {
  try {
    const { employeeId, date } = req.query;
    if (!employeeId || !date) {
      return res.status(400).json({ error: 'Funcionário e data são obrigatórios.' });
    }

    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, companyId: req.companyId }
    });
    if (!employee) return res.status(404).json({ error: 'Funcionário não encontrado.' });

    const start = dayjs(date).startOf('day').toDate();
    const end = dayjs(date).endOf('day').toDate();

    const entries = await prisma.timeEntry.findMany({
      where: { employeeId, timestamp: { gte: start, lte: end } },
      orderBy: { timestamp: 'asc' }
    });

    const typeLabels = { CLOCK_IN: 'Entrada', BREAK_START: 'Almoço Ida', BREAK_END: 'Almoço Volta', CLOCK_OUT: 'Saída' };
    res.json({
      employee: { id: employee.id, name: employee.name },
      date,
      entries: entries.map(e => ({
        id: e.id,
        type: e.type,
        typeLabel: typeLabels[e.type] || e.type,
        timestamp: e.timestamp,
        time: dayjs(e.timestamp).format('HH:mm:ss'),
        adjustedBy: e.adjustedBy,
        adjustmentNote: e.adjustmentNote,
        originalTimestamp: e.originalTimestamp,
        photo: e.photo || null,
        latitude: e.latitude || null,
        longitude: e.longitude || null,
        address: e.address || null
      }))
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar registros.' });
  }
}

module.exports = { editTimeEntry, addTimeEntry, deleteTimeEntry, listAdjustments, getEntriesByDate };
