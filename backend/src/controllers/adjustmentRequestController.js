/**
 * Controller de solicitações de ajuste de ponto (funcionário → admin)
 * @module controllers/adjustmentRequestController
 */
const prisma = require('../config/database');
const { formatBR } = require('../utils/brazilTime');

// ─── EMPLOYEE ENDPOINTS ───────────────────────────────────────────

/** Funcionário cria solicitação de ajuste */
async function createRequest(req, res) {
  try {
    const { entryId, requestType, requestedValue, reason } = req.body;
    const employeeId = req.employeeId;

    if (!requestType || !reason || reason.trim().length < 5) {
      return res.status(400).json({ error: 'Tipo de solicitação e justificativa (mín. 5 caracteres) são obrigatórios.' });
    }

    const validTypes = ['EDIT', 'ADD', 'DELETE'];
    if (!validTypes.includes(requestType)) {
      return res.status(400).json({ error: 'Tipo inválido. Use EDIT, ADD ou DELETE.' });
    }

    let currentValue = null;

    // Se é edição ou exclusão, o entryId deve existir e pertencer ao funcionário
    if (requestType === 'EDIT' || requestType === 'DELETE') {
      if (!entryId) {
        return res.status(400).json({ error: 'ID do registro é obrigatório para edição/exclusão.' });
      }
      const entry = await prisma.timeEntry.findUnique({ where: { id: entryId } });
      if (!entry || entry.employeeId !== employeeId) {
        return res.status(404).json({ error: 'Registro não encontrado.' });
      }
      currentValue = JSON.stringify({
        timestamp: entry.timestamp,
        type: entry.type,
        time: formatBR(entry.timestamp, 'HH:mm:ss')
      });
    }

    // Se é adição, requestedValue deve ter timestamp e type
    if (requestType === 'ADD') {
      if (!requestedValue || !requestedValue.timestamp || !requestedValue.type) {
        return res.status(400).json({ error: 'Horário e tipo são obrigatórios para adição.' });
      }
    }

    // Se é edição, requestedValue deve ter o novo timestamp
    if (requestType === 'EDIT') {
      if (!requestedValue || !requestedValue.timestamp) {
        return res.status(400).json({ error: 'Novo horário é obrigatório para edição.' });
      }
    }

    // Verificar se já existe solicitação pendente para o mesmo registro
    if (entryId) {
      const existing = await prisma.adjustmentRequest.findFirst({
        where: { entryId, employeeId, status: 'PENDING' }
      });
      if (existing) {
        return res.status(409).json({ error: 'Já existe uma solicitação pendente para este registro.' });
      }
    }

    const request = await prisma.adjustmentRequest.create({
      data: {
        employeeId,
        entryId: entryId || null,
        requestType,
        currentValue,
        requestedValue: requestedValue ? JSON.stringify(requestedValue) : null,
        reason: reason.trim(),
        status: 'PENDING'
      }
    });

    res.status(201).json({ message: 'Solicitação enviada com sucesso. Aguarde a aprovação do administrador.', request });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao criar solicitação.' });
  }
}

/** Funcionário lista suas solicitações */
async function myRequests(req, res) {
  try {
    const requests = await prisma.adjustmentRequest.findMany({
      where: { employeeId: req.employeeId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        timeEntry: { select: { type: true, timestamp: true } }
      }
    });

    const formatted = requests.map(r => ({
      ...r,
      createdAtFormatted: formatBR(r.createdAt, 'DD/MM/YYYY') + ' ' + formatBR(r.createdAt, 'HH:mm'),
      reviewedAtFormatted: r.reviewedAt ? formatBR(r.reviewedAt, 'DD/MM/YYYY') + ' ' + formatBR(r.reviewedAt, 'HH:mm') : null,
      entryTime: r.timeEntry ? formatBR(r.timeEntry.timestamp, 'HH:mm:ss') : null,
      entryDate: r.timeEntry ? formatBR(r.timeEntry.timestamp, 'DD/MM/YYYY') : null,
    }));

    res.json({ requests: formatted, total: formatted.length });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar solicitações.' });
  }
}

// ─── ADMIN ENDPOINTS ──────────────────────────────────────────────

/** Admin lista todas as solicitações pendentes da empresa */
async function listPendingRequests(req, res) {
  try {
    const { status } = req.query;
    const where = {
      employee: { companyId: req.companyId }
    };
    if (status) where.status = status;
    else where.status = 'PENDING';

    const requests = await prisma.adjustmentRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        employee: { select: { name: true, cpf: true, department: true } },
        timeEntry: { select: { type: true, timestamp: true } }
      }
    });

    const formatted = requests.map(r => ({
      ...r,
      createdAtFormatted: formatBR(r.createdAt, 'DD/MM/YYYY') + ' ' + formatBR(r.createdAt, 'HH:mm'),
      entryTime: r.timeEntry ? formatBR(r.timeEntry.timestamp, 'HH:mm:ss') : null,
      entryDate: r.timeEntry ? formatBR(r.timeEntry.timestamp, 'DD/MM/YYYY') : null,
    }));

    res.json({ requests: formatted, total: formatted.length });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar solicitações.' });
  }
}

/** Admin aprova uma solicitação */
async function approveRequest(req, res) {
  try {
    const { requestId } = req.params;
    const { reviewNote } = req.body;

    const request = await prisma.adjustmentRequest.findUnique({
      where: { id: requestId },
      include: { employee: true, timeEntry: true }
    });
    if (!request) return res.status(404).json({ error: 'Solicitação não encontrada.' });
    if (request.employee.companyId !== req.companyId) {
      return res.status(403).json({ error: 'Sem permissão.' });
    }
    if (request.status !== 'PENDING') {
      return res.status(400).json({ error: 'Solicitação já foi processada.' });
    }

    const requestedValue = request.requestedValue ? JSON.parse(request.requestedValue) : null;

    // Executar a ação solicitada
    if (request.requestType === 'EDIT' && request.entryId && requestedValue) {
      const parsedNew = new Date(requestedValue.timestamp);
      if (isNaN(parsedNew.getTime())) {
        return res.status(400).json({ error: 'Horário solicitado é inválido.' });
      }

      const oldEntry = request.timeEntry;
      await prisma.timeEntry.update({
        where: { id: request.entryId },
        data: {
          timestamp: parsedNew,
          adjustedBy: req.userId,
          adjustedAt: new Date(),
          adjustmentNote: `Aprovado via solicitação: ${request.reason}`,
          originalTimestamp: oldEntry.originalTimestamp || oldEntry.timestamp
        }
      });

      // Log de auditoria
      await prisma.timeAdjustmentLog.create({
        data: {
          employeeId: request.employeeId,
          entryId: request.entryId,
          action: 'EDIT',
          oldValue: request.currentValue,
          newValue: JSON.stringify({ timestamp: parsedNew, type: oldEntry.type }),
          reason: `Solicitação do funcionário: ${request.reason}`,
          adjustedBy: req.userId
        }
      });
    } else if (request.requestType === 'ADD' && requestedValue) {
      const parsedTimestamp = new Date(requestedValue.timestamp);
      if (isNaN(parsedTimestamp.getTime())) {
        return res.status(400).json({ error: 'Horário solicitado é inválido.' });
      }

      const entry = await prisma.timeEntry.create({
        data: {
          employeeId: request.employeeId,
          type: requestedValue.type,
          timestamp: parsedTimestamp,
          adjustedBy: req.userId,
          adjustedAt: new Date(),
          adjustmentNote: `Adicionado via solicitação: ${request.reason}`,
          notes: 'Registro adicionado via solicitação do funcionário'
        }
      });

      await prisma.timeAdjustmentLog.create({
        data: {
          employeeId: request.employeeId,
          entryId: entry.id,
          action: 'ADD',
          newValue: JSON.stringify({ timestamp: parsedTimestamp, type: requestedValue.type }),
          reason: `Solicitação do funcionário: ${request.reason}`,
          adjustedBy: req.userId
        }
      });
    } else if (request.requestType === 'DELETE' && request.entryId) {
      await prisma.timeAdjustmentLog.create({
        data: {
          employeeId: request.employeeId,
          entryId: request.entryId,
          action: 'DELETE',
          oldValue: request.currentValue,
          reason: `Solicitação do funcionário: ${request.reason}`,
          adjustedBy: req.userId
        }
      });

      await prisma.timeEntry.delete({ where: { id: request.entryId } });
    }

    // Atualizar status da solicitação
    const updated = await prisma.adjustmentRequest.update({
      where: { id: requestId },
      data: {
        status: 'APPROVED',
        reviewedBy: req.userId,
        reviewedAt: new Date(),
        reviewNote: reviewNote?.trim() || 'Aprovado'
      }
    });

    res.json({ message: 'Solicitação aprovada e aplicada com sucesso.', request: updated });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao aprovar solicitação.' });
  }
}

/** Admin rejeita uma solicitação */
async function rejectRequest(req, res) {
  try {
    const { requestId } = req.params;
    const { reviewNote } = req.body;

    if (!reviewNote || reviewNote.trim().length < 3) {
      return res.status(400).json({ error: 'Motivo da rejeição é obrigatório.' });
    }

    const request = await prisma.adjustmentRequest.findUnique({
      where: { id: requestId },
      include: { employee: true }
    });
    if (!request) return res.status(404).json({ error: 'Solicitação não encontrada.' });
    if (request.employee.companyId !== req.companyId) {
      return res.status(403).json({ error: 'Sem permissão.' });
    }
    if (request.status !== 'PENDING') {
      return res.status(400).json({ error: 'Solicitação já foi processada.' });
    }

    const updated = await prisma.adjustmentRequest.update({
      where: { id: requestId },
      data: {
        status: 'REJECTED',
        reviewedBy: req.userId,
        reviewedAt: new Date(),
        reviewNote: reviewNote.trim()
      }
    });

    res.json({ message: 'Solicitação rejeitada.', request: updated });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao rejeitar solicitação.' });
  }
}

/** Admin conta solicitações pendentes (para badge no menu) */
async function countPending(req, res) {
  try {
    const count = await prisma.adjustmentRequest.count({
      where: { status: 'PENDING', employee: { companyId: req.companyId } }
    });
    res.json({ count });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao contar solicitações.' });
  }
}

module.exports = { createRequest, myRequests, listPendingRequests, approveRequest, rejectRequest, countPending };
