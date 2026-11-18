const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const doc=JSON.parse(fs.readFileSync('apps/gateway/src/openapi.json','utf8'));
const gateway=fs.readFileSync('apps/gateway/src/main.ts','utf8');
test('OpenAPI documenta só a superfície pública do gateway',()=>{
 assert.deepEqual(Object.keys(doc.paths).sort(),['/auth/login','/auth/logout','/auth/refresh','/graphql','/health']);
 assert.ok(!JSON.stringify(doc).includes('/internal'),'rotas internas não podem aparecer na documentação');
});
test('rotas /auth documentadas são exatamente as que o gateway encaminha',()=>{
 const allowed=/\[('\/auth\/[a-z]+'(?:,\s*)?)+\]\.includes\(url\.pathname\)/.exec(gateway);
 assert.ok(allowed,'lista de rotas /auth não encontrada no gateway');
 const code=[...allowed[0].matchAll(/'(\/auth\/[a-z]+)'/g)].map(m=>m[1]).sort();
 assert.deepEqual(Object.keys(doc.paths).filter(p=>p.startsWith('/auth')).sort(),code);
});
test('POST /auth/* exige o cabeçalho CSRF e respostas de erro padronizadas',()=>{
 for(const p of ['/auth/login','/auth/refresh','/auth/logout']){
  const op=doc.paths[p].post;assert.ok(op.parameters.some(x=>x.$ref==='#/components/parameters/CsrfHeader'),p);
  assert.ok(op.responses['403'],`${p} documenta 403`);
 }
 assert.ok(doc.paths['/auth/login'].post.responses['401']&&doc.paths['/auth/login'].post.responses['429']);
});
test('todos os $ref resolvem e há esquemas de segurança coerentes',()=>{
 const refs=[...JSON.stringify(doc).matchAll(/"\$ref":"#\/([^"]+)"/g)].map(m=>m[1]);
 for(const r of refs){let node=doc;for(const part of r.split('/'))node=node?.[part];assert.ok(node,`$ref quebrado: ${r}`);}
 assert.equal(doc.components.securitySchemes.bearerAuth.scheme,'bearer');assert.equal(doc.components.securitySchemes.cookieAuth.name,'sdv_refresh');
});
test('sem segredos na documentação e Swagger só liga com flag fora de produção',()=>{
 const text=JSON.stringify(doc);assert.ok(!/eyJ[A-Za-z0-9_-]{10,}/.test(text),'token JWT real na documentação');
 assert.match(text,/<senha definida no seed>/);
 assert.match(gateway,/SWAGGER_ENABLED==='1'&&process\.env\.NODE_ENV!=='production'/);
});
