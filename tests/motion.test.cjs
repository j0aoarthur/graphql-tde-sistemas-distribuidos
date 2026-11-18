const test=require('node:test'),assert=require('node:assert/strict');
const {advanceMotion,profile,patrolRouteAllowed}=require('../packages/shared/motion.cjs');
const {meters}=require('../packages/shared/route.cjs');
const points=[[-12.26,-38.97],[-12.26,-38.96],[-12.25,-38.96]];
test('urban physical motion accelerates gradually, varies per vehicle and slows before a turn',()=>{
 const a=advanceMotion({points,id:'a',elapsed:1}),b=advanceMotion({points,id:'b',elapsed:1});
 assert(a.speed<=1.8);assert(meters(points[0],a.point)<1);assert.notEqual(a.speed,b.speed);
 let state={progress:0,speed:0};let maximum=0;
 for(let i=0;i<160;i++){state=advanceMotion({points,id:'a',elapsed:1,...state});maximum=Math.max(maximum,state.speed);assert(state.speed<=14);}
 assert(maximum>6);assert(profile('a').cruise!==profile('b').cruise);
 const approach=advanceMotion({points,id:'a',progress:.48,speed:11,elapsed:2});assert(approach.speed<11);
});
test('step splitting, complete arrival and no catch-up teleport after a long outage',()=>{
 const whole=advanceMotion({points,id:'a',elapsed:2});const half=advanceMotion({points,id:'a',elapsed:1});const split=advanceMotion({points,id:'a',elapsed:1,progress:half.progress,speed:half.speed});assert(Math.abs(whole.progress-split.progress)<1e-10);
 const end=advanceMotion({points,id:'a',elapsed:10,progress:.999,speed:2});assert.equal(end.progress,1);assert.equal(end.speed,0);assert.equal(end.etaSeconds,0);
 assert(advanceMotion({points,id:'a',elapsed:1}).progress<.001);
});
test('patrol rejects routes leaving urban perimeter and permits bounded return of legacy positions',()=>{
 assert(patrolRouteAllowed(points));assert(!patrolRouteAllowed([...points,[-12.4,-38.96]]));
 assert(patrolRouteAllowed([[-12.33,-38.96],[-12.30,-38.96],points[0]]));
 assert(!patrolRouteAllowed([[-12.33,-38.96],[-12.4,-38.96],points[0]]));
});
test('recorded OSRM street geometry in Feira: bounded speed, corner braking and stopped arrival',()=>{
 const fixture=require('./fixtures/osrm-feira-centro.json'),points=fixture.geometry.coordinates.map(([lon,lat])=>[lat,lon]);assert(points.length>20);assert(patrolRouteAllowed(points));
 let state={progress:0,speed:0},elapsed=0,peak=0,braking=false;
 while(state.progress<1&&elapsed<1800){const previous=state;state=advanceMotion({points,id:'osrm-real-feiracentro',elapsed:1,...state});assert(state.progress>=previous.progress);assert(state.speed<=14);assert(state.speed-previous.speed<=1.8);braking||=state.progress<.95&&previous.speed-state.speed>.5;peak=Math.max(peak,state.speed);elapsed++;}
 assert.equal(state.progress,1);assert.equal(state.speed,0);assert.deepEqual(state.point,points.at(-1));assert(braking);assert(peak>7);assert(elapsed>100);
});
