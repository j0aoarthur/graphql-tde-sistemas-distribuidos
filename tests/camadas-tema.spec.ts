// Camadas e tema da interface: modal acima do drawer, viatura acima do pin, respiro do drawer embutido e
// blocos de página que seguem o tema escuro. Cria e cancela uma ocorrência própria.
import {test,expect,type Page} from '@playwright/test';
import {cancelCreated} from './helpers/cleanup';
const API=(process.env.SDV_API??'http://127.0.0.1:4000/graphql');
async function setup(page:Page,theme:'light'|'dark'='light'){
 await page.addInitScript(t=>{try{localStorage.setItem('sdv-theme',t)}catch{/* sem storage */}},theme);
 await page.route('https://api.maptiler.com/maps/**',r=>r.fulfill({json:{version:8,sources:{},layers:[{id:'bg',type:'background',paint:{'background-color':theme==='dark'?'#0f1b27':'#edf1f5'}}]}}));
 await page.goto('http://localhost:5173');await page.getByLabel('Senha de acesso').fill(process.env.DEMO_ADMIN_PASSWORD!);await page.getByRole('button',{name:'Acessar central'}).click();
 await expect(page.getByRole('heading',{name:'Fila de atendimento'})).toBeVisible();
}
async function openIncident(request:import('@playwright/test').APIRequestContext,title:string){
 const call=async(query:string,variables:Record<string,unknown>={},token='')=>{const r=await request.post(API,{headers:token?{authorization:`Bearer ${token}`}:{},data:{query,variables}});const b=await r.json();expect(b.errors).toBeUndefined();return b.data;};
 const token=(await call('mutation($s:String!){login(email:"central-a@sdv.local",senha:$s){accessToken}}',{s:process.env.DEMO_ADMIN_PASSWORD})).login.accessToken;
 const data=await call('mutation($i:AbrirOcorrenciaInput!){abrirOcorrencia(input:$i){id}}',{i:{tipo:title,descricao:'Teste de camadas da interface',enderecoFormatado:'Rua de teste, Centro, Feira de Santana - BA',origemLocalizacao:'PIN',precisaoLocalizacao:'PONTO',localConfirmado:true,prioridade:3,latitude:-12.2664,longitude:-38.9663,clientRequestId:crypto.randomUUID()}},token);
 return {id:data.abrirOcorrencia.id as string,token};
}
test('drawer embutido tem respiro; viatura fica acima do pin; modal fica acima do drawer',async({page,request})=>{
 test.setTimeout(60000);const title='Camadas QA '+crypto.randomUUID().slice(0,5);let created:{id:string;token:string}|null=null;
 try{
  created=await openIncident(request,title);await setup(page,'dark');
  await page.locator('.queue-card').filter({hasText:title}).first().click();
  const panel=page.locator('.operational-sidebar .detail-panel');await expect(panel).toBeVisible();
  // 5) texto do drawer não encosta na borda do painel (tema escuro)
  const box=await panel.boundingBox(),heading=await panel.locator('.dw-hero h2').boundingBox();
  expect(heading!.x-box!.x,'respiro lateral do título').toBeGreaterThanOrEqual(3);
  // 3) viatura acima do pin: z-index e elemento do topo no centro da viatura
  await expect(page.locator('.vehicle-marker').first()).toBeVisible();await expect(page.locator('.incident-pin').first()).toBeVisible();
  const z=await page.evaluate(()=>({v:Number(getComputedStyle(document.querySelector('.vehicle-marker')!).zIndex),p:Number(getComputedStyle(document.querySelector('.incident-pin')!).zIndex)}));
  expect(z.v).toBeGreaterThan(z.p);
  // 4) modal de confirmação acima do drawer: o botão de confirmar é o elemento do topo
  await page.getByRole('button',{name:'Cancelar ocorrência',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Cancelar ocorrência'});await expect(dialog).toBeVisible();
  const confirm=dialog.getByRole('button',{name:'Cancelar ocorrência',exact:true}),cb=await confirm.boundingBox();
  const top=await page.evaluate(({x,y})=>{const e=document.elementFromPoint(x,y);return !!e&&!!e.closest('.modal');},{x:cb!.x+cb!.width/2,y:cb!.y+cb!.height/2});
  expect(top,'o diálogo deve cobrir o drawer').toBe(true);
  await dialog.getByLabel(/Justificativa/).fill('Cancelamento do teste de camadas');await confirm.click();await expect(dialog).toHaveCount(0);
 }finally{await cancelCreated(request,created?[created.id]:[],created?.token);}
});
test('blocos de página seguem o tema: nada claro no escuro e nada escuro no claro (6 telas)',async({page})=>{
 test.setTimeout(90000);
 const views=[/^Central operacional$/,/^Mapa operacional$/,/^Ocorrências(?: \d+)?$/,/^Viaturas$/,/^Histórico de despachos$/,/^Laboratório$/];
 for(const theme of ['dark','light'] as const){
  await page.context().clearCookies();await setup(page,theme);
  for(const view of views){
   await page.locator('.sidebar').getByRole('button',{name:view}).click();await page.waitForTimeout(600);
   const bad=await page.evaluate((t)=>{
    const lum=(c:string)=>{const m=c.match(/[\d.]+/g)?.map(Number)??[];if(m.length<3||(m.length>3&&m[3]<0.5))return null;const [r,g,b]=m.map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4;});return .2126*r+.7152*g+.0722*b;};
    const out:string[]=[];
    for(const e of document.querySelectorAll('.main-area *')){
     if(e.closest('.maplibregl-map,.operations-map,.map-shell,.fleet-mini-map,.toast,.btn-primary,.btn-danger,.badge,.priority,.map-legend,.map-controls,.table-progress,.progress-track'))continue;
     const r=e.getBoundingClientRect();if(r.width*r.height<6000||r.width<120||r.height<40)continue;
     const l=lum(getComputedStyle(e).backgroundColor);if(l==null)continue;
     if(t==='dark'&&l>0.35)out.push((e.className||e.tagName).toString().slice(0,40)+' lum='+l.toFixed(2));
     if(t==='light'&&l<0.1)out.push((e.className||e.tagName).toString().slice(0,40)+' lum='+l.toFixed(2));
    }
    return out;},theme);
   expect(bad,`${theme} · ${view}`).toEqual([]);
  }
 }
});
