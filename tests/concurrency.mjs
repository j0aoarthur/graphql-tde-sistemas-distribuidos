// Teste API E2E de concorrência real: executar SOMENTE contra ambiente de testes isolado.
// Não altera frota/ocorrências existentes; cria duas ocorrências simultâneas de centrais distintas.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const API=process.env.GRAPHQL_URL??'http://localhost:4000/graphql';
const password=process.env.DEMO_ADMIN_PASSWORD;
if(process.env.NODE_ENV!=='test' || !password) throw Error('Exige NODE_ENV=test e DEMO_ADMIN_PASSWORD de ambiente isolado');
async function query(gql,vars={},token='') {
 const r=await fetch(API,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify({query:gql,variables:vars})});
 const body=await r.json();if(body.errors?.length || !r.ok) throw new Error(JSON.stringify(body.errors??r.status));return body.data;
}
async function login(email){const {login}=await query('mutation($email:String!,$senha:String!){login(email:$email,senha:$senha){accessToken}}',{email,senha:password});return login.accessToken;}
const [a,b]=await Promise.all([login('central-a@sdv.local'),login('central-b@sdv.local')]);
const sameLocation={descricao:'Teste automatizado concorrente',enderecoFormatado:'Feira de Santana BA',origemLocalizacao:'PIN',precisaoLocalizacao:'PONTO',localConfirmado:true,tipo:'Teste automático concorrente',prioridade:3,latitude:-12.26,longitude:-38.97};
const gql='mutation($input:AbrirOcorrenciaInput!){abrirOcorrencia(input:$input){id status}}';
const [one,two]=await Promise.all([query(gql,{input:{...sameLocation,clientRequestId:randomUUID()}},a),query(gql,{input:{...sameLocation,clientRequestId:randomUUID()}},b)]);
assert.notEqual(one.abrirOcorrencia.id,two.abrirOcorrencia.id);
const ids=new Set([one.abrirOcorrencia.id,two.abrirOcorrencia.id]);
let received=[];
for(let i=0;i<30;i++){
 const data=await query('query{listarOcorrencias{id status viaturaId}}',{},a);
 received=data.listarOcorrencias.filter(x=>ids.has(x.id));
 if(received.length===2 && received.every(x=>x.status==='DESPACHADA'||x.status==='AGUARDANDO_VIATURA')) break;
 await new Promise(r=>setTimeout(r,500));
}
assert.equal(received.length,2,'ocorrências criadas devem persistir');
assert.ok(received.every(x=>x.status==='DESPACHADA'||x.status==='AGUARDANDO_VIATURA'),'workers devem processar eventos');
const assigned=received.map(x=>x.viaturaId).filter(Boolean);
assert.equal(new Set(assigned).size,assigned.length,'nenhuma viatura alocada duas vezes');
console.log('PASSOU: duas centrais, concorrência GraphQL, nenhuma viatura duplicada',received);
