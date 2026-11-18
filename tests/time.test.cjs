const {test}=require('node:test');const assert=require('node:assert/strict');
const load=()=>import('../apps/painel-frontend/src/lib/time.ts');
test('duração: escala adapta a precisão e nunca vira "5557 min"',async()=>{
 const {formatDuration}=await load();
 const cases=[[0,'0 s'],[39,'39 s'],[60,'1 min'],[75,'1 min 15 s'],[3599,'59 min 59 s'],[3605,'1 h'],[3600+5*60,'1 h 05 min'],[5*3600+12*60,'5 h 12 min'],[86400,'1 d'],[5557*60+33,'3 d 20 h'],[null,'Indisponível'],[undefined,'Indisponível'],[Number.NaN,'Indisponível'],[-10,'0 s']];
 for(const [input,expected] of cases)assert.equal(formatDuration(input),expected,String(input));
});
test('tempo relativo e rótulos de dia respeitam America/Bahia',async()=>{
 const {formatAgo,formatMoment,formatDayLabel,formatClock,sameDay}=await load();
 const now=Date.parse('2026-11-16T15:00:00Z'); // 12:00 em Salvador (UTC-3)
 assert.equal(formatAgo('2026-11-16T14:59:58Z',now),'agora');
 assert.equal(formatAgo('2026-11-16T14:59:30Z',now),'há 30 s');
 assert.equal(formatAgo('2026-11-16T14:55:00Z',now),'há 5 min');
 assert.equal(formatAgo('2026-11-16T10:00:00Z',now),'há 5 h');
 assert.equal(formatAgo('2026-11-15T12:00:00Z',now),'ontem');
 assert.equal(formatAgo('2026-11-10T12:00:00Z',now),'há 6 d');
 assert.equal(formatAgo(null,now),'—');
 assert.equal(formatClock('2026-11-16T15:07:00Z'),'12:07');
 assert.equal(formatMoment('2026-11-16T15:07:00Z',now),'Hoje, 12:07');
 assert.equal(formatMoment('2026-11-15T15:07:00Z',now),'Ontem, 12:07');
 // 01:30 UTC de 16/11 ainda é noite de 15/11 na Bahia
 assert.equal(formatMoment('2026-11-16T01:30:00Z',now),'Ontem, 22:30');
 assert.equal(formatDayLabel('2026-11-16T15:00:00Z',now),'Hoje');
 assert.match(formatMoment('2026-11-01T15:07:00Z',now),/^01 nov, 12:07$/);
 assert.equal(sameDay('2026-11-16T01:30:00Z','2026-11-15T20:00:00Z'),true);
});
