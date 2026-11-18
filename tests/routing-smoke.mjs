import assert from 'node:assert/strict';
const base=process.env.OSRM_REAL_URL;
if(!base)throw Error('Exige OSRM_REAL_URL explícito; não usa fixture como evidência de rua real');
const response=await fetch(`${base}/route/v1/driving/-38.97,-12.26;-38.9594,-12.2577?overview=full&geometries=geojson`,{signal:AbortSignal.timeout(15000)});
assert.equal(response.status,200);const data=await response.json();assert.equal(data.code,'Ok');assert.ok(data.routes[0].geometry.coordinates.length>2);assert.ok(data.routes[0].distance>0);assert.ok(data.routes[0].duration>0);
console.log('PASSOU: OSRM real retornou geometria, distância e duração para dois pontos de Feira de Santana',JSON.stringify({pontos:data.routes[0].geometry.coordinates.length,metros:data.routes[0].distance,segundos:data.routes[0].duration}));
