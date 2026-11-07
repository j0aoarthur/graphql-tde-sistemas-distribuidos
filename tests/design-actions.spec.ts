import {test,expect,type Page} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import {cancelCreated,removeCreatedVehicle} from './helpers/cleanup';
const shots='test-results/design-actions';
async function setup(page:Page){
 await page.route('https://api.maptiler.com/maps/**',r=>r.fulfill({json:{version:8,sources:{},layers:[{id:'test-background',type:'background',paint:{'background-color':r.request().url().includes('dark')?'#263340':'#edf1f5'}}]}}));
 await page.route('https://api.maptiler.com/geocoding/**',r=>r.fulfill({json:{features:[{center:[-38.95,-12.249],place_name:'Rua de validação, 42, Centro, Feira de Santana, Bahia',address:'42',context:[{id:'neighbourhood.centro',text:'Centro'},{id:'postal_code.44001000',text:'44001-000'}]}]}}));
 await page.goto('http://localhost:5173');await page.getByLabel('Senha de acesso').fill(process.env.DEMO_ADMIN_PASSWORD!);await page.getByRole('button',{name:'Acessar central'}).click();await expect(page.getByRole('heading',{name:'Central operacional',exact:true})).toBeVisible();await expect(page.locator('.vehicle-marker').first()).toBeAttached();
 if(await page.getByRole('button',{name:'Fechar notificação'}).isVisible())await page.getByRole('button',{name:'Fechar notificação'}).click();
}
async function navigate(page:Page,name:RegExp){
 if(await page.getByRole('button',{name:'Abrir menu',exact:true}).isVisible())await page.getByRole('button',{name:'Abrir menu',exact:true}).click();
 await page.getByRole('navigation',{name:'Menu principal'}).getByRole('button',{name}).click();
}
for(const width of [1440,1024,820,768,390,360]){
 test(`design e navegação das seis telas em ${width}px`,async({page})=>{
  test.setTimeout(90000);await page.setViewportSize({width,height:width<800?844:900});await setup(page);
  const views=[['central',/^Central operacional$/,'Central operacional'],['mapa',/^Mapa operacional$/,'Mapa operacional'],['ocorrencias',/^Ocorrências(?: \d+)?$/,'Ocorrências'],['frota',/^Viaturas$/,'Gestão de viaturas'],['historico',/^Histórico de despachos$/,'Histórico de despachos'],['laboratorio',/^Laboratório$/,'Laboratório de simulação']] as const;
  for(const [id,nav,title] of views){await test.step(id,async()=>{
   await navigate(page,nav);await expect(page.locator('h1')).toHaveText(title);await page.evaluate(()=>document.fonts.ready);
   const overflow=await page.evaluate(()=>({viewport:innerWidth,content:document.documentElement.scrollWidth}));expect.soft(overflow.content,`${id}: sem overflow horizontal da página`).toBeLessThanOrEqual(overflow.viewport+1);
   const primary=page.getByRole('button',{name:id==='frota'?'Nova viatura':id==='laboratorio'?'Sincronizar':'Nova ocorrência',exact:true});await expect(primary).toBeInViewport();await primary.click({trial:true});if(id==='laboratorio'){const response=page.waitForResponse(r=>r.url().endsWith('/graphql')&&!!r.request().postData()?.includes('PainelOperacional'));await primary.click();expect((await(await response).json()).errors).toBeUndefined();}
   const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze();await writeFile(test.info().outputPath(`${id}-accessibility.json`),JSON.stringify({viewport:width,view:id,overflow,violations:results.violations},null,2));expect.soft(results.violations.map(v=>`${v.id}: ${v.nodes.length} elementos`),`${id}: acessibilidade`).toEqual([]);
   await page.screenshot({path:`${shots}/${width}-${id}.png`,fullPage:true});
  });}
 });
}
test('ações do mapa: filtros, seleção, acompanhamento, pan, zoom e tema',async({page})=>{
 await setup(page);await navigate(page,/^Mapa operacional$/);
 await page.getByRole('button',{name:'Em atendimento',exact:true}).click();await expect(page.locator('.vehicle-marker[data-status="DISPONIVEL"]')).toHaveCount(0);
 await page.getByRole('button',{name:'Em patrulha',exact:true}).click();await expect(page.locator('.vehicle-marker[data-status="DISPONIVEL"]').first()).toBeVisible();const index=await page.locator('.vehicle-marker').evaluateAll(nodes=>nodes.findIndex(el=>{const b=el.getBoundingClientRect(),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return hit?.closest('.vehicle-marker')===el;}));expect(index).toBeGreaterThanOrEqual(0);const car=page.locator('.vehicle-marker').nth(index);await car.click();await expect(page.locator('.detail-panel')).toBeVisible();
 await page.getByRole('button',{name:'Acompanhar viatura',exact:true}).click();await expect(page.getByRole('button',{name:'Parar de acompanhar',exact:true})).toBeVisible();
 const canvas=page.locator('.geographic-workspace .maplibregl-canvas'),box=(await canvas.boundingBox())!;await page.mouse.move(box.x+70,box.y+100);await page.mouse.down();await page.mouse.move(box.x+160,box.y+150,{steps:12});await page.mouse.up();await expect(page.getByRole('button',{name:'Acompanhar viatura',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Zoom in',exact:true}).click();await expect.poll(async()=>Number(await page.locator('.operations-map').getAttribute('data-zoom'))).toBeGreaterThan(13.5);
 await page.getByRole('button',{name:'Tema escuro',exact:true}).click();await expect(page.getByRole('button',{name:'Tema claro',exact:true})).toBeVisible();await expect(car).toBeAttached();await page.getByLabel('Mostrar todas as rotas').check();
 await page.screenshot({path:`${shots}/mapa-acoes-tema.png`,fullPage:true});
 await page.getByRole('button',{name:'Centralizar cidade',exact:true}).click();await expect.poll(async()=>Number(await page.locator('.operations-map').getAttribute('data-zoom'))).toBeCloseTo(13,1);
});
test('teclado no formulário: sugestões, foco, selects e confirmação',async({page})=>{
 await setup(page);await page.getByRole('button',{name:'Nova ocorrência',exact:true}).click();const dialog=page.getByRole('dialog');const search=page.getByLabel('Buscar endereço');await expect(search).toBeFocused();await search.fill('Rua de validação');await expect(page.getByRole('listbox',{name:'Sugestões de endereço'}).getByRole('option').first()).toBeVisible();await search.press('ArrowDown');await expect(page.getByRole('listbox',{name:'Sugestões de endereço'}).getByRole('option').first()).toBeFocused();await page.keyboard.press('Enter');await expect(page.getByLabel('Bairro',{exact:true})).toHaveValue('Centro');
 await page.getByLabel('Tipo',{exact:true}).selectOption('Outro');await page.getByLabel('Especificar tipo').fill('Verificação de teclado');await page.getByLabel('Prioridade',{exact:true}).selectOption('5');const description=page.getByLabel('Descrição',{exact:true});await description.fill('Descrição da validação de teclado');
 const clock=await page.locator('.top-time').innerText();await expect.poll(()=>page.locator('.top-time').innerText()).not.toBe(clock);await expect(description).toBeFocused();
 await page.getByRole('button',{name:'Confirmar localização',exact:true}).click();const submit=page.getByRole('button',{name:'Registrar ocorrência',exact:true});await expect(submit).toBeEnabled();await submit.focus();await page.keyboard.press('Tab');await expect(dialog.getByRole('button',{name:'Fechar',exact:true})).toBeFocused();await page.keyboard.press('Shift+Tab');await expect(submit).toBeFocused();await page.screenshot({path:`${shots}/formulario-teclado.png`});await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
});
test('despacho pela interface: registrar, pausar, retomar e cancelar com motivo',async({page,request})=>{
 test.setTimeout(60000);const ids:string[]=[];await setup(page);const title='Ações QA '+crypto.randomUUID().slice(0,6);
 try{
  await page.getByRole('button',{name:'Nova ocorrência',exact:true}).click();await page.getByLabel('Tipo',{exact:true}).selectOption('Outro');await page.getByLabel('Especificar tipo').fill(title);await page.getByLabel('Descrição',{exact:true}).fill('Validação de pausa e cancelamento pela interface');await page.getByLabel('Buscar endereço').fill('Rua de validação');await page.getByRole('listbox',{name:'Sugestões de endereço'}).getByRole('option').first().click();await page.getByRole('button',{name:'Confirmar localização',exact:true}).click();
  const response=page.waitForResponse(r=>r.url().endsWith('/graphql')&&!!r.request().postData()?.includes('abrirOcorrencia'));await page.getByRole('button',{name:'Registrar ocorrência',exact:true}).click();const created=(await(await response).json()).data.abrirOcorrencia;ids.push(created.id);await expect(page.locator('.operation-row').filter({hasText:title})).toBeVisible();
  await navigate(page,/^Histórico de despachos$/);const row=page.getByRole('row').filter({hasText:title});await expect(row).toBeVisible();await row.click();await expect(page.getByRole('button',{name:'Pausar viatura',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Pausar viatura',exact:true}).click();await expect(page.getByRole('button',{name:'Retomar viatura',exact:true})).toBeVisible();await expect(page.locator('.arrival-info')).toHaveCount(0);await expect(page.locator('.detail-panel')).toContainText('ETA suspenso');
  await page.getByRole('button',{name:'Retomar viatura',exact:true}).click();await expect(page.getByRole('button',{name:'Pausar viatura',exact:true})).toBeVisible();await page.getByRole('button',{name:'Fechar detalhes',exact:true}).click();
  await navigate(page,/^Ocorrências(?: \d+)?$/);await page.getByPlaceholder('Buscar por tipo ou identificador...').fill(title);await page.getByRole('row').filter({hasText:title}).click();await page.screenshot({path:`${shots}/despacho-retomado.png`,fullPage:true});page.once('dialog',d=>d.accept('Cancelamento solicitado na validação Playwright'));await page.getByRole('button',{name:'Cancelar ocorrência',exact:true}).click();await expect(page.locator('.timeline')).toContainText('Ocorrência cancelada',{timeout:12000});
 }finally{await cancelCreated(request,ids);}
});

test('tabelas e filtros acessíveis por teclado; legenda compacta da frota',async({page})=>{
 await page.setViewportSize({width:390,height:844});await setup(page);await page.getByRole('button',{name:'Abrir menu',exact:true}).focus();await page.keyboard.press('Shift+Tab');expect(await page.locator('.sidebar').evaluate(el=>el.contains(document.activeElement))).toBe(false);await navigate(page,/^Viaturas$/);const legend=page.locator('.fleet-mini-map .map-legend');await expect(legend).not.toHaveAttribute('open','');await legend.locator('summary').focus();await page.keyboard.press('Enter');await expect(legend).toHaveAttribute('open','');await expect(legend).toContainText('Disponível / patrulhando');await page.keyboard.press('Enter');await expect(legend).not.toHaveAttribute('open','');
 await page.getByLabel('Buscar viaturas').fill('SDV001');await expect(page.locator('.data-table tbody tr')).toHaveCount(1);const open=page.getByRole('button',{name:'Detalhes da viatura: SDV001',exact:true});await open.focus();await page.keyboard.press('Enter');await expect(page.locator('.detail-panel')).toContainText('SDV001');await page.getByRole('button',{name:'Fechar detalhes',exact:true}).click();
 const region=page.getByRole('region',{name:'Tabela de viaturas'});await region.focus();const left=await region.evaluate(el=>el.scrollLeft);await page.keyboard.press(left>0?'ArrowLeft':'ArrowRight');if(left>0)await expect.poll(()=>region.evaluate(el=>el.scrollLeft)).toBeLessThan(left);else await expect.poll(()=>region.evaluate(el=>el.scrollLeft)).toBeGreaterThan(left);await page.screenshot({path:`${shots}/tabela-teclado-mobile.png`,fullPage:true});
 await page.getByLabel('Buscar viaturas').fill('INEXISTENTE');await expect(page.getByText('Nenhuma viatura encontrada')).toBeVisible();await page.getByLabel('Buscar viaturas').fill('');await page.getByRole('button',{name:'Em operação',exact:true}).click();await expect(page.locator('.data-table tbody tr')).toHaveCount(0);await page.getByRole('button',{name:'Todas',exact:true}).click();await expect(page.locator('.data-table tbody tr')).toHaveCount(12);
});
test('cadastro de viatura: mapa, capacidade, validação e persistência',async({page,request})=>{
 test.setTimeout(60000);await page.setViewportSize({width:390,height:844});await setup(page);let id='';const plate='QA'+crypto.randomUUID().slice(0,6).toUpperCase();
 try{
  await navigate(page,/^Viaturas$/);await page.getByRole('button',{name:'Nova viatura',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Cadastrar viatura'});await expect(dialog).toBeVisible();await expect(page.getByLabel('Identificação / placa')).toBeFocused();await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(page.getByRole('button',{name:'Nova viatura',exact:true})).toBeFocused();await page.getByRole('button',{name:'Nova viatura',exact:true}).click();await page.getByLabel('Identificação / placa').fill('x');await page.getByRole('button',{name:'Cadastrar viatura',exact:true}).click();await expect(dialog).toBeVisible();expect(await page.getByLabel('Identificação / placa').evaluate(el=>(el as HTMLInputElement).validity.valid)).toBe(false);
  await page.getByLabel('Identificação / placa').fill(plate);await page.getByLabel('Capacidade',{exact:true}).selectOption('4');await dialog.locator('.maplibregl-canvas').click({position:{x:140,y:130}});await expect(dialog.getByLabel('Local selecionado')).toBeVisible();const accessibility=await new AxeBuilder({page}).include('.modal').withTags(['wcag2a','wcag2aa']).analyze();expect(accessibility.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.failureSummary)}))).toEqual([]);await page.screenshot({path:`${shots}/cadastro-viatura-mobile.png`});
  const response=page.waitForResponse(r=>r.url().endsWith('/graphql')&&!!r.request().postData()?.includes('cadastrarViatura'));await page.getByRole('button',{name:'Cadastrar viatura',exact:true}).click();const body=await(await response).json();expect(body.errors).toBeUndefined();id=body.data.cadastrarViatura.id;await expect(dialog).toHaveCount(0);await page.getByLabel('Buscar viaturas').fill(plate);await expect(page.locator('.data-table tbody tr')).toHaveCount(1);await expect(page.locator('.data-table tbody tr')).toContainText('4 ocupantes');
 }finally{
  await removeCreatedVehicle(id,plate);
 }
});

test('laboratório: pausar, retomar, ajustar velocidade por teclado e restaurar 1×',async({page,request})=>{
 await setup(page);await navigate(page,/^Laboratório$/);
 const auth=await request.post('http://127.0.0.1:4000/graphql',{data:{query:'mutation($s:String!){login(email:"central-a@sdv.local",senha:$s){accessToken}}',variables:{s:process.env.DEMO_ADMIN_PASSWORD}}});const token=(await auth.json()).data.login.accessToken;
 const call=async(query:string)=>{const response=await request.post('http://127.0.0.1:4000/graphql',{headers:{authorization:`Bearer ${token}`},data:{query}});const body=await response.json();expect(body.errors).toBeUndefined();return body.data;};
 try{
  await page.getByRole('button',{name:'Pausar simulação',exact:true}).click();await expect(page.getByRole('button',{name:'Retomar simulação',exact:true})).toBeVisible();expect((await call('query{estadoSimulacao{pausada}}')).estadoSimulacao.pausada).toBe(true);
  await page.getByRole('button',{name:'Retomar simulação',exact:true}).click();await expect(page.getByRole('button',{name:'Pausar simulação',exact:true})).toBeVisible();await page.getByRole('button',{name:'Restaurar velocidade real (1×)',exact:true}).click();const slider=page.getByLabel('Velocidade de simulação');await expect(slider).toHaveValue('1');await slider.focus();await slider.press('ArrowRight');await expect.poll(async()=>(await call('query{estadoSimulacao{fator}}')).estadoSimulacao.fator).toBe(2);await expect(slider).toHaveValue('2');
  await page.getByRole('button',{name:'Restaurar velocidade real (1×)',exact:true}).click();await expect(slider).toHaveValue('1');expect((await call('query{estadoSimulacao{fator pausada}}')).estadoSimulacao).toEqual({fator:1,pausada:false});await page.screenshot({path:`${shots}/laboratorio-acoes.png`,fullPage:true});
 }finally{await call('mutation{configurarSimulacao(fator:1,pausada:false){fator}}');}
});
