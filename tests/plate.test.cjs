const {test}=require('node:test');const assert=require('node:assert/strict');
const {normalizePlate,isValidPlate,formatPlate,maskPlate,plateKind}=require('../packages/shared/plate.cjs');
test('aceita placa antiga e Mercosul, com ou sem hifen e em qualquer caixa',()=>{
 for(const ok of ['ABC-1234','abc1234','ABC1D23','abc-1d23'])assert.equal(isValidPlate(ok),true,ok);
 for(const bad of ['','ABC-123','AB1-2345','ABCD123','ABC12345','1BC1D23','ABC-12D4','SDV001'])assert.equal(isValidPlate(bad),false,bad);
});
test('normaliza para armazenamento e formata para exibicao',()=>{
 assert.equal(normalizePlate(' abc-1d23 '),'ABC1D23');assert.equal(formatPlate('abc1234'),'ABC-1234');assert.equal(formatPlate('ABC1D23'),'ABC1D23');assert.equal(formatPlate('SDV001'),'SDV001');
 assert.equal(plateKind('ABC-1234'),'ANTIGA');assert.equal(plateKind('ABC1D23'),'MERCOSUL');assert.equal(plateKind('SDV001'),null);
});
test('mascara de digitacao respeita as posicoes e decide o hifen pelo quinto caractere',()=>{
 assert.equal(maskPlate('a'),'A');assert.equal(maskPlate('abc'),'ABC');assert.equal(maskPlate('abc1'),'ABC1');
 assert.equal(maskPlate('abc12'),'ABC-12');assert.equal(maskPlate('abc1234'),'ABC-1234');assert.equal(maskPlate('abc1234999'),'ABC-1234');
 assert.equal(maskPlate('abc1d'),'ABC1D');assert.equal(maskPlate('abc1d23'),'ABC1D23');
 assert.equal(maskPlate('1b2c'),'BC');assert.equal(maskPlate('abc-1d-2-3'),'ABC1D23');
});
