// Real HTTP gateway + PostgreSQL; no credentials or tokens are printed.
import assert from 'node:assert/strict';
const base=process.env.GRAPHQL_URL?.replace(/\/graphql$/,'')??'http://localhost:4000';
const headers={'content-type':'application/json','x-sdv-csrf':'1',origin:'http://localhost:5173'};
async function call(path,body={},cookie='',extra={}){return fetch(`${base}/auth/${path}`,{method:'POST',headers:{...headers,...extra,cookie},body:JSON.stringify(body)});}
assert.equal((await call('refresh',{},'',{origin:'https://evil.invalid'})).status,403);
assert.equal((await call('refresh',{},'',{'x-sdv-csrf':''})).status,403);
assert.equal((await call('refresh')).status,401);
const login=await call('login',{email:'central-a@sdv.local',senha:process.env.DEMO_ADMIN_PASSWORD});
assert.equal(login.status,200);assert.equal(login.headers.get('cache-control'),'no-store');
const set=login.headers.get('set-cookie');assert.match(set,/HttpOnly/);assert.match(set,/SameSite=Strict/);assert.match(set,/Path=\/auth/);
const old=set.split(';')[0];
const refreshed=await call('refresh',{},old);assert.equal(refreshed.status,200);
const current=refreshed.headers.get('set-cookie').split(';')[0];assert.notEqual(current,old);
const data=await refreshed.json();assert.ok(data.accessToken);
const me=await fetch(`${base}/graphql`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${data.accessToken}`},body:JSON.stringify({query:'{me{id centralId}}'})});
assert.ok((await me.json()).data.me.id);
const retry=await call('refresh',{},old);assert.equal(retry.status,200);assert.equal(retry.headers.get('set-cookie').split(';')[0],current);
assert.equal((await call('logout',{},current)).status,200);
assert.equal((await call('refresh',{},current)).status,401);
console.log('PASSOU: CSRF, login, cookie HttpOnly/Strict, rotação, token federado, conflito concorrente e revogação no PostgreSQL');

const second=await call('login',{email:'central-a@sdv.local',senha:process.env.DEMO_ADMIN_PASSWORD});assert.equal(second.status,200);
const firstCookie=second.headers.get('set-cookie').split(';')[0];
const r1=await call('refresh',{},firstCookie),c1=r1.headers.get('set-cookie').split(';')[0];
const r2=await call('refresh',{},c1),c2=r2.headers.get('set-cookie').split(';')[0];
assert.equal((await call('refresh',{},firstCookie)).status,401);
assert.equal((await call('refresh',{},c2)).status,401);
console.log('PASSOU: reutilização de token histórico revoga a família inteira da sessão');
