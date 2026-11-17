// Arena de concorrência (UI). BLOQUEADO (skip) se o ambiente de demonstração não estiver no ar:
//   npm run demo:arena  +  VITE_DEMO_ARENA=1 no frontend. Cria e cancela chamados [ARENA]; restaura as viaturas ao final.
import {test,expect,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const tile=(page:Page,label:string)=>page.locator('.arena-tile',{hasText:label}).locator('b').first();
async function open(page:Page){
 await page.route('https://api.maptiler.com/maps/**',r=>r.fulfill({json:{version:8,sources:{},layers:[{id:'bg',type:'background',paint:{'background-color':'#edf1f5'}}]}}));
 await page.goto('http://localhost:5173');await page.getByLabel('Senha de acesso').fill(process.env.DEMO_ADMIN_PASSWORD!);await page.getByRole('button',{name:'Acessar central'}).click();
 await expect(page.getByRole('heading',{name:'Fila de atendimento'})).toBeVisible();
 const menu=page.getByRole('button',{name:'Abrir menu'});if(await menu.isVisible())await menu.click(); // celular: menu em gaveta
 const nav=page.locator('.sidebar').getByRole('button',{name:'Arena de concorrência'});
 test.skip(await nav.count()===0,'BLOQUEADO: frontend sem VITE_DEMO_ARENA=1');
 await nav.click();await expect(page.locator('section.arena')).toBeVisible();
 const ready=await page.getByRole('button',{name:'Preparar'}).isEnabled({timeout:1000}).then(()=>expect(page.getByRole('button',{name:'Preparar'})).toBeEnabled({timeout:8000}).then(()=>true,()=>false)).catch(()=>false);
 test.skip(!ready,'BLOQUEADO: backend sem SDV_DEMO_MODE/SDV_DEMO_TRACE (rode npm run demo:arena)');
}
test('arena: 8 chamados disputam 3 viaturas, 0 duplicadas, fila drena ao liberar; AA nos dois temas',async({page})=>{
 test.setTimeout(120000);
 await open(page);
 try{
  await page.getByRole('button',{name:'Preparar'}).click();
  await expect(page.locator('.arena-tile',{hasText:'Viaturas livres'})).toContainText('9 reservadas',{timeout:10000});
  await page.getByRole('button',{name:'Disparar 8'}).click();
  await expect(tile(page,'Despachados')).toHaveText('3',{timeout:15000});
  await expect(tile(page,'Em espera')).toHaveText('5');
  await expect(tile(page,'Viaturas duplicadas')).toHaveText('0');
  await expect(page.locator('.arena-lane')).toHaveCount(8);
  await expect(page.locator('.arena-proof-result b')).toHaveText('0');
  // a11y nos dois temas
  for(const theme of ['light','dark']){
   await page.evaluate(t=>{document.documentElement.dataset.theme=t;},theme);await page.waitForTimeout(600); // deixa as transições de cor terminarem antes do axe
   const result=await new AxeBuilder({page}).include('section.arena').withTags(['wcag2a','wcag2aa']).exclude('.operations-map').analyze();
   expect(result.violations.map(v=>({theme,id:v.id,nodes:v.nodes.map(n=>n.html)}))).toEqual([]);
  }
  // liberar uma viatura: o primeiro da fila é despachado logo (3 despachados continua, espera cai para 4)
  await page.getByRole('button',{name:'Liberar'}).click();
  await expect(tile(page,'Em espera')).toHaveText('4',{timeout:10000});
  await expect(tile(page,'Despachados')).toHaveText('3');
  await expect(tile(page,'Viaturas duplicadas')).toHaveText('0');
 }finally{
  await page.getByRole('button',{name:'Reiniciar cenário'}).click().catch(()=>undefined);
  await expect(tile(page,'Chamados')).toHaveText('0',{timeout:20000}).catch(()=>undefined);
 }
});
test('arena: sem lock do Redis o CAS barra tentativas e a duplicidade segue em zero; modo apresentação com atalhos',async({page})=>{
 test.setTimeout(120000);
 await open(page);
 try{
  await page.getByRole('button',{name:/Lock do Redis/}).click();
  await expect(page.getByRole('button',{name:/Lock do Redis/})).toContainText('desligado');
  await page.getByRole('button',{name:'Preparar'}).click();
  await expect(page.locator('.arena-tile',{hasText:'Viaturas livres'})).toContainText('9 reservadas',{timeout:10000});
  await page.getByRole('button',{name:'Modo apresentação'}).click();
  await expect(page.locator('.arena--presenter')).toBeVisible();
  await page.keyboard.press('d');
  await expect(tile(page,'Despachados')).toHaveText('3',{timeout:15000});
  await expect(tile(page,'Viaturas duplicadas')).toHaveText('0');
  const cas=Number(await page.locator('.arena-layer--main b').innerText());
  expect(cas,'com 3 workers e sem lock, o CAS deve barrar ao menos uma tentativa').toBeGreaterThanOrEqual(1);
  await page.keyboard.press('Escape');await expect(page.locator('.arena--presenter')).toHaveCount(0);
 }finally{
  await page.getByRole('button',{name:'Reiniciar cenário'}).click().catch(()=>undefined);
  await expect(tile(page,'Chamados')).toHaveText('0',{timeout:20000}).catch(()=>undefined);
 }
});
test('arena no celular: sem rolagem horizontal',async({page})=>{
 await page.setViewportSize({width:390,height:844});await open(page);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
});
