import {test,expect} from '@playwright/test';
async function fixtures(page:any){
 await page.route('https://api.maptiler.com/maps/**',async(route:any)=>route.fulfill({json:{version:8,sources:{},layers:[{id:'test-background',type:'background',paint:{'background-color':'#edf1f5'}}]}}));
 await page.route('https://api.maptiler.com/geocoding/**',async(route:any)=>route.fulfill({json:{features:[{center:[-38.969,-12.26],place_name:'Rua de teste, Centro, Feira de Santana, Bahia'}]}}));
 await page.route('https://viacep.com.br/**',async(route:any)=>route.fulfill({json:{cep:'44001-000',logradouro:'Rua de teste',bairro:'Centro',localidade:'Feira de Santana',uf:'BA'}}));
}
for(const viewport of [{width:1366,height:768},{width:1440,height:900},{width:390,height:844}]){
 test(`mapa, endereço, CEP, pin e confirmação ${viewport.width}`,async({page})=>{
  await page.setViewportSize(viewport);await fixtures(page);await page.goto('http://localhost:5173');
  await page.getByLabel('Senha de acesso').fill(process.env.DEMO_ADMIN_PASSWORD!);await page.getByRole('button',{name:'Acessar central'}).click();
  await expect(page.locator('.operational-workspace')).toBeVisible();await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  await expect(page.locator('.vehicle-marker').first()).toBeAttached();
  await expect(page.locator('.welcome-banner')).toHaveCount(0);
  if(viewport.width>800){const map=await page.locator('.operational-map').boundingBox(),workspace=await page.locator('.operational-workspace').boundingBox();expect(map!.width/workspace!.width).toBeGreaterThanOrEqual(.65);}
  await page.screenshot({path:`test-results/map-${viewport.width}.png`});
  await page.getByRole('button',{name:'Nova ocorrência',exact:true}).click();
  const submit=page.getByRole('button',{name:'Registrar ocorrência',exact:true});await expect(submit).toBeDisabled();
  await page.getByLabel('Buscar endereço').fill('Rua de teste');await page.getByRole('button',{name:/Rua de teste.*Endereço aproximado/}).click();
  await expect(page.getByLabel('Local selecionado')).toBeVisible();await expect(submit).toBeDisabled();
  await page.getByLabel('Descrição',{exact:true}).fill('Chamado fictício de teste v3.2');
  await page.getByRole('button',{name:'Confirmar localização',exact:true}).click();await expect(submit).toBeEnabled();
  await expect(page.locator('.location-preview')).toContainText(/Estimativa viária|ETA indisponível/);
  await page.getByRole('button',{name:'Ajustar localização',exact:true}).click();await expect(submit).toBeDisabled();
  await page.getByLabel('Buscar endereço').fill('44001000');await page.getByRole('button',{name:/Rua de teste.*CEP aproximado/}).click();await expect(page.locator('.location-preview')).toContainText('Local aproximado');
  const canvas=page.getByRole('dialog').locator('.maplibregl-canvas');await canvas.click({position:{x:140,y:150}});await expect(page.getByLabel('Local selecionado')).toBeVisible();
  await page.getByRole('button',{name:'Confirmar localização',exact:true}).click();await expect(submit).toBeEnabled();
  await page.screenshot({path:`test-results/pin-${viewport.width}.png`});
  await submit.click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.operational-sidebar')).toContainText('Acidente de trânsito');
 });
}
