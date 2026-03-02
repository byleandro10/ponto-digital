/**
 * Controller de cercas virtuais (geofencing)
 * @module controllers/geofenceController
 */
const prisma = require('../config/database');

/** Listar cercas da empresa */
async function listGeofences(req, res) {
  try {
    const geofences = await prisma.geofence.findMany({
      where: { companyId: req.companyId },
      orderBy: { name: 'asc' }
    });
    // Normaliza: expõe tanto "radius" quanto "radiusMeters" para compatibilidade
    const normalized = geofences.map(f => ({ ...f, radiusMeters: f.radius }));
    res.json({ geofences: normalized });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao listar cercas.' });
  }
}

/** Criar nova cerca */
async function createGeofence(req, res) {
  try {
    const { name, latitude, longitude } = req.body;
    // Aceita tanto "radius" quanto "radiusMeters" para compatibilidade com frontend
    const radius = req.body.radius ?? req.body.radiusMeters;
    if (!name || latitude == null || longitude == null || radius == null) {
      return res.status(400).json({ error: 'Nome, latitude, longitude e raio são obrigatórios.' });
    }
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const rad = parseInt(radius);
    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ error: 'Latitude e longitude devem ser números.' });
    }
    if (rad < 10 || rad > 10000) {
      return res.status(400).json({ error: 'Raio deve ser entre 10 e 10.000 metros.' });
    }
    const geofence = await prisma.geofence.create({
      data: { companyId: req.companyId, name: name.trim(), latitude: lat, longitude: lng, radius: rad }
    });
    res.status(201).json({ message: 'Cerca criada com sucesso!', geofence });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao criar cerca.' });
  }
}

/** Atualizar cerca */
async function updateGeofence(req, res) {
  try {
    const fence = await prisma.geofence.findFirst({
      where: { id: req.params.id, companyId: req.companyId }
    });
    if (!fence) return res.status(404).json({ error: 'Cerca não encontrada.' });

    const { name, latitude, longitude, active } = req.body;
    const radius = req.body.radius ?? req.body.radiusMeters;
    const updated = await prisma.geofence.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name: name.trim() }),
        ...(latitude != null && { latitude: parseFloat(latitude) }),
        ...(longitude != null && { longitude: parseFloat(longitude) }),
        ...(radius != null && { radius: parseInt(radius) }),
        ...(active !== undefined && { active })
      }
    });
    res.json({ message: 'Cerca atualizada!', geofence: updated });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao atualizar cerca.' });
  }
}

/** Excluir cerca */
async function deleteGeofence(req, res) {
  try {
    const fence = await prisma.geofence.findFirst({
      where: { id: req.params.id, companyId: req.companyId }
    });
    if (!fence) return res.status(404).json({ error: 'Cerca não encontrada.' });
    await prisma.geofence.delete({ where: { id: req.params.id } });
    res.json({ message: 'Cerca removida com sucesso.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao remover cerca.' });
  }
}

/** Atualizar config de geofencing da empresa */
async function updateGeofenceConfig(req, res) {
  try {
    const { geofenceMode, requireSelfie } = req.body;
    const data = {};
    if (geofenceMode !== undefined) {
      if (!['off', 'warn', 'block'].includes(geofenceMode)) {
        return res.status(400).json({ error: 'Modo deve ser: off, warn ou block.' });
      }
      data.geofenceMode = geofenceMode;
    }
    if (requireSelfie !== undefined) data.requireSelfie = !!requireSelfie;

    const company = await prisma.company.update({
      where: { id: req.companyId },
      data,
      select: { geofenceMode: true, requireSelfie: true }
    });
    res.json({ message: 'Configuração atualizada!', config: company });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao atualizar configuração.' });
  }
}

/** Obter config da empresa */
async function getCompanyConfig(req, res) {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.companyId },
      select: { geofenceMode: true, requireSelfie: true, name: true, cnpj: true, address: true }
    });
    res.json({ config: company });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar configuração.' });
  }
}

module.exports = { listGeofences, createGeofence, updateGeofence, deleteGeofence, updateGeofenceConfig, getCompanyConfig };
