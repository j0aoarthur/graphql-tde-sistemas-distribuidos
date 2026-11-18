const {test}=require('node:test');const assert=require('node:assert/strict');const {reconcileList}=require('../packages/shared/state.cjs');
test('reconexão e eventos atrasados não regridem versões ou heartbeat',()=>{
 const current=[{id:'v',versao:9,status:'NO_LOCAL',ultimoSinalEm:'2026-11-05T04:00:01Z'}];
 assert.equal(reconcileList(current,[{id:'v',versao:8,status:'OCUPADA'}])[0],current[0]);
 assert.equal(reconcileList(current,[{id:'v',versao:9,status:'NO_LOCAL',ultimoSinalEm:'2026-11-05T04:00:00Z'}])[0],current[0]);
 assert.equal(reconcileList(current,[{id:'v',versao:10,status:'DISPONIVEL'}])[0].status,'DISPONIVEL');
});
