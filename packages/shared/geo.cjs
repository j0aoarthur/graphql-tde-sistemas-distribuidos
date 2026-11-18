"use strict";
const EARTH_RADIUS_KM = 6371.0088;
function haversineKm(a, b) {
  for (const p of [a, b]) {
    if (!Number.isFinite(p.latitude) || !Number.isFinite(p.longitude) || Math.abs(p.latitude) > 90 || Math.abs(p.longitude) > 180) throw new Error('Coordenadas inválidas');
  }
  const rad = (deg) => deg * Math.PI / 180;
  const dLat = rad(b.latitude - a.latitude), dLon = rad(b.longitude - a.longitude);
  const x = Math.sin(dLat/2)**2 + Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(dLon/2)**2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(x)));
}
function rankViaturas(candidates, destination) {
  return candidates.filter(v => v.status === 'DISPONIVEL')
    .map(v => ({...v, distanceKm: haversineKm(v, destination)}))
    .sort((a,b) => a.distanceKm - b.distanceKm || String(a.id).localeCompare(String(b.id)));
}
module.exports = { haversineKm, rankViaturas };
