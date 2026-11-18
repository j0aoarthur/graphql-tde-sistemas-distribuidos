import {test,expect} from '@playwright/test';
import {cancelCreated} from './helpers/cleanup';
async function fixtures(page:any){
 await page.route('https://api.maptiler.com/maps/**',async(route:any)=>route.fulfill({json:{version:8,sources:{},layers:[{id:'test-background',type:'background',paint:{'background-color':'#edf1f5'}}]}}));
 await page.route('https://api.maptiler.com/geocoding/**',async(route:any)=>{
  const url=new URL(route.request().url()),reverse=/%2C|,/.test(url.pathname);
  // Match the real API contract: reverse + limit>1 without one type is invalid.
  if(reverse&&Number(url.searchParams.get('limit'))>1&&!url.searchParams.get('types'))return route.fulfill({status:400,json:{error:'Invalid reverse limit'}});
  return route.fulfill({json:{features:[{id:'address.test',place_type:['address'],geometry:{type:'Point',coordinates:[-38.969,-12.26]},address:'145',place_name:'Rua de teste, 145, Centro, Feira de Santana, Bahia',context:[{id:'neighbourhood.centro',text:'Centro'},{id:'postal_code.44001000',text:'44001-000'}]}]}});
 });
 await page.route('https://viacep.com.br/**',async(route:any)=>route.fulfill({json:{cep:'44001-000',logradouro:'Rua de teste',bairro:'Centro',localidade:'Feira de Santana',uf:'BA'}}));
}
for(const viewport of [{width:1366,height:768},{width:1440,height:900},{width:390,height:844}]){
 test(`mapa, endereço, CEP, pin e confirmação ${viewport.width}`,async({page,request})=>{
  const created:string[]=[];try{
  await page.setViewportSize(viewport);await fixtures(page);await page.goto('http://localhost:5173');
  await page.getByLabel('Senha de acesso').fill(process.env.DEMO_ADMIN_PASSWORD!);await page.getByRole('button',{name:'Acessar central'}).click();
  await expect(page.locator('.operational-workspace')).toBeVisible();await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  await expect(page.locator('.vehicle-marker').first()).toBeAttached();
  await expect(page.locator('.welcome-banner')).toHaveCount(0);
  if(viewport.width>800){const map=await page.locator('.operational-map').boundingBox(),workspace=await page.locator('.operational-workspace').boundingBox();expect(map!.width/workspace!.width).toBeGreaterThanOrEqual(.65);}
  await page.screenshot({path:`test-results/map-${viewport.width}.png`});
  await page.getByRole('button',{name:'Nova ocorrência',exact:true}).click();
  const submit=page.getByRole('button',{name:'Registrar ocorrência',exact:true});await expect(submit).toBeDisabled();
  await page.getByLabel('Buscar endereço').fill('Rua de teste');await expect(page.locator('#address-suggestions')).toHaveCSS('position','absolute');await page.screenshot({path:`test-results/address-popup-${viewport.width}.png`});await page.getByRole('option',{name:/Rua de teste.*Endereço aproximado/}).click();
  await expect(page.getByLabel('Local selecionado')).toBeVisible();await expect(submit).toBeDisabled();await expect(page.getByLabel('Bairro',{exact:true})).toHaveValue('Centro');await expect(page.getByLabel('CEP',{exact:true})).toHaveValue('44001-000');await expect(page.getByLabel('Número',{exact:true})).toHaveValue('145');await expect(page.getByRole('dialog').locator('.map-legend')).toHaveCount(0);await expect(page.getByLabel('Tipo',{exact:true})).toHaveValue('Acidente de trânsito');
  await page.getByLabel('Descrição',{exact:true}).fill('Chamado fictício de teste v3.2');
  await page.getByRole('button',{name:'Confirmar localização',exact:true}).click();await expect(submit).toBeEnabled();
  await expect(page.locator('.location-preview')).toContainText(/Estimativa viária|ETA indisponível/);
  await page.getByRole('button',{name:'Ajustar localização',exact:true}).click();await expect(submit).toBeDisabled();
  await page.getByLabel('Buscar endereço').fill('44001000');await page.getByRole('option',{name:/Rua de teste.*CEP aproximado/}).click();await expect(page.locator('.location-preview')).toContainText('Local aproximado');
  const canvas=page.getByRole('dialog').locator('.maplibregl-canvas');await canvas.click({position:{x:140,y:150}});await expect(page.getByLabel('Local selecionado')).toBeVisible();
  await expect(page.getByRole('button',{name:'Confirmar localização',exact:true})).toBeEnabled();
  await expect(page.locator('.location-preview')).toContainText('Rua de teste');await expect(page.getByLabel('Bairro',{exact:true})).toHaveValue('Centro');
  const oldPoint=await page.locator('.location-preview p').nth(1).innerText();
  await page.getByLabel('Local selecionado').dragTo(canvas,{targetPosition:{x:220,y:170}});
  await expect(page.locator('.location-preview p').nth(1)).not.toHaveText(oldPoint);
  await page.getByRole('button',{name:'Confirmar localização',exact:true}).click();await expect(submit).toBeEnabled();
  const pickerCanvas=await canvas.boundingBox(),help=await page.locator('.map-pick-help').boundingBox();expect(help!.y).toBeGreaterThanOrEqual(pickerCanvas!.y+pickerCanvas!.height-1);
  await expect.poll(async()=>{const pin=await page.getByLabel('Local selecionado').boundingBox();return pin!.y+pin!.height<=help!.y+1;}).toBe(true);
  await page.screenshot({path:`test-results/pin-${viewport.width}.png`});
  const previewPoint=await page.locator('.location-preview p').nth(1).innerText();
  const creation=page.waitForResponse(r=>r.url().endsWith('/graphql')&&!!r.request().postData()?.includes('abrirOcorrencia'));
  await submit.click();const response=await creation;const body=await response.json();expect(body.errors).toBeUndefined();created.push(body.data.abrirOcorrencia.id);const input=JSON.parse(response.request().postData()!).variables.input;
  expect(previewPoint).toContain(input.latitude.toFixed(5)+', '+input.longitude.toFixed(5));expect(input.localConfirmado).toBe(true);expect(input.origemLocalizacao).toBe('PIN');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.operational-sidebar')).toContainText('Acidente de trânsito');
  await page.locator('.operation-row').filter({hasText:'Acidente de trânsito'}).first().click();
  await expect(page.locator('.timeline')).toContainText('Ocorrência registrada');
  await expect(page.locator('.timeline')).toContainText('ADMIN');
  await expect(page.locator('.timeline small').first()).toContainText(/\d{2}:\d{2}:\d{2}/);
  }finally{await cancelCreated(request,created);}
 });
}

test('falha de busca permite pin e referência; cancelar não cria ocorrência',async({page})=>{
 await fixtures(page);await page.route('https://api.maptiler.com/geocoding/**',r=>r.fulfill({status:503,json:{error:'fixture unavailable'}}));
 let creates=0;page.on('request',r=>{if(r.url().endsWith('/graphql')&&r.postData()?.includes('abrirOcorrencia'))creates++;});
 await page.goto('http://localhost:5173');await page.getByLabel('Senha de acesso').fill(process.env.DEMO_ADMIN_PASSWORD!);await page.getByRole('button',{name:'Acessar central'}).click();await page.getByRole('button',{name:'Nova ocorrência',exact:true}).click();
 await page.getByLabel('Buscar endereço').fill('Endereço indisponível');await expect(page.getByRole('status').filter({hasText:'Consulta de endereço indisponível'})).toBeVisible();
 await page.getByRole('dialog').locator('.maplibregl-canvas').click({position:{x:140,y:150}});await page.getByLabel('Referência',{exact:true}).fill('Referência manual de teste');await page.getByLabel('Descrição',{exact:true}).fill('Chamado fictício em teste');
 await page.getByRole('button',{name:'Confirmar localização',exact:true}).click();await expect(page.getByRole('button',{name:'Registrar ocorrência',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Cancelar',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);expect(creates).toBe(0);
});

test('reverse pendente bloqueia confirmação e preserva edições diante de resposta antiga',async({page})=>{
 await fixtures(page);const pending:any[]=[];
 await page.route('https://api.maptiler.com/geocoding/**',route=>{pending.push(route);});
 await page.goto('http://localhost:5173');await page.getByLabel('Senha de acesso').fill(process.env.DEMO_ADMIN_PASSWORD!);await page.getByRole('button',{name:'Acessar central'}).click();await page.getByRole('button',{name:'Nova ocorrência',exact:true}).click();
 const canvas=page.getByRole('dialog').locator('.maplibregl-canvas');await canvas.click({position:{x:150,y:130}});await expect.poll(()=>pending.length).toBe(1);
 await canvas.click({position:{x:500,y:160}});await expect.poll(()=>pending.length).toBe(2);
 await page.getByLabel('Bairro',{exact:true}).fill('Bairro revisado manualmente');await page.getByLabel('Referência',{exact:true}).fill('Referência do ponto mais recente');await page.getByLabel('Descrição',{exact:true}).fill('Teste de resposta reversa concorrente');
 await expect(page.getByRole('button',{name:'Confirmar localização',exact:true})).toBeDisabled();
 await pending[1].fulfill({json:{features:[{center:[-38.966,-12.26],place_name:'Rua atual, Feira de Santana',context:[{id:'neighbourhood.provedor',text:'Bairro do provedor'},{id:'postal_code.atual',text:'44001-000'}]}]}});
 await expect(page.locator('.location-preview')).toContainText('Rua atual');await expect(page.getByLabel('Bairro',{exact:true})).toHaveValue('Bairro revisado manualmente');await expect(page.getByLabel('CEP',{exact:true})).toHaveValue('44001-000');
 await pending[0].fulfill({json:{features:[{center:[-38.966,-12.26],place_name:'Resposta antiga, Feira de Santana'}]}}).catch(()=>{});
 await expect(page.locator('.location-preview')).not.toContainText('Resposta antiga');await page.getByRole('button',{name:'Confirmar localização',exact:true}).click();await expect(page.getByRole('button',{name:'Registrar ocorrência',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Cancelar',exact:true}).click();
});
