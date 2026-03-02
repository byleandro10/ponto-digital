/**
 * Serviço de geofencing — verifica se coordenadas estão dentro de cercas virtuais
 * @module services/geofenceService
 */

/**
 * Calcula distância entre dois pontos usando fórmula de Haversine
 * @param {number} lat1 - Latitude ponto 1
 * @param {number} lon1 - Longitude ponto 1
 * @param {number} lat2 - Latitude ponto 2
 * @param {number} lon2 - Longitude ponto 2
 * @returns {number} Distância em metros
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // raio da Terra em metros
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Verifica se o ponto está dentro de alguma cerca virtual
 * @param {number} lat - Latitude do ponto
 * @param {number} lng - Longitude do ponto
 * @param {Array} geofences - Lista de cercas { latitude, longitude, radius, name }
 * @returns {{ inside: boolean, fence: object|null, distance: number|null }}
 */
function checkGeofence(lat, lng, geofences) {
  if (!lat || !lng || !geofences || geofences.length === 0) {
    return { inside: null, fence: null, distance: null };
  }

  let closestFence = null;
  let closestDistance = Infinity;

  for (const fence of geofences) {
    if (!fence.active) continue;
    const dist = haversineDistance(lat, lng, fence.latitude, fence.longitude);
    if (dist < closestDistance) {
      closestDistance = dist;
      closestFence = fence;
    }
    if (dist <= fence.radius) {
      return { inside: true, fence, distance: Math.round(dist) };
    }
  }

  return {
    inside: false,
    fence: closestFence,
    distance: closestFence ? Math.round(closestDistance) : null
  };
}

module.exports = { haversineDistance, checkGeofence };
