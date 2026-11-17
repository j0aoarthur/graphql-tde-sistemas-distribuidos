// Restaura as viaturas reservadas pela Arena (INDISPONIVEL -> DISPONIVEL). Uso: node scripts/arena-restore.mjs <graphql-url>
const API = process.argv[2] ?? 'http://localhost:4000/graphql';
const password = process.env.DEMO_ADMIN_PASSWORD;
if (!password) throw Error('DEMO_ADMIN_PASSWORD ausente');
const call = async (query, variables = {}, token = '') => {
  const r = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ query, variables }) });
  const b = await r.json(); if (b.errors?.length) throw new Error(b.errors.map((e) => e.message).join('; ')); return b.data;
};
const { login } = await call('mutation($e:String!,$s:String!){login(email:$e,senha:$s){accessToken}}', { e: 'central-a@sdv.local', s: password });
const { restaurarArena: s } = await call('mutation{restaurarArena{livres reservadas}}', {}, login.accessToken);
console.log(`Viaturas restauradas: ${s.livres} livres, ${s.reservadas} reservadas.`);
