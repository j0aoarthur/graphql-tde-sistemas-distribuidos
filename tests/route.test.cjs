const test = require('node:test');
const assert = require('node:assert/strict');
// Mantém o algoritmo isolado de dependências de infra para testes unitários.
const {alongRoute} = require('../packages/shared/route.cjs');
test('início e fim da rota',()=>{const a=[-12.25,-38.95],b=[-12.26,-38.96];assert.deepEqual(alongRoute([a,b],0),a);assert.deepEqual(alongRoute([a,b],1),b);});
test('interpolação acompanha geometria real (quebra de direção)',()=>{const p=[[-12.25,-38.95],[-12.25,-38.96],[-12.26,-38.96]];const m=alongRoute(p,0.75);assert.equal(m[1],-38.96);assert.ok(m[0]<-12.25&&m[0]>-12.26);});
