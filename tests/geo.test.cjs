const { test } = require('node:test');
const assert = require('node:assert/strict');
const { haversineKm, rankViaturas } = require('../packages/shared/geo.cjs');
test('distância zero para mesmo ponto', () => assert.equal(haversineKm({latitude:-12.26,longitude:-38.97},{latitude:-12.26,longitude:-38.97}),0));
test('ordena apenas viaturas livres e com desempate estável', () => {
  const destino={latitude:-12.26,longitude:-38.97};
  const vs=[{id:'z',status:'DISPONIVEL',...destino},{id:'b',status:'OCUPADA',...destino},{id:'a',status:'DISPONIVEL',...destino},{id:'c',status:'DISPONIVEL',latitude:-12.30,longitude:-38.95}];
  assert.deepEqual(rankViaturas(vs,destino).map(x=>x.id),['a','z','c']);
});
test('valida latitude e longitude', () => assert.throws(()=>haversineKm({latitude:100,longitude:0},{latitude:0,longitude:0})));
