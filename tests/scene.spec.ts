import {test,expect} from '@playwright/test';
test('três despachos, cores por status, seleção, tema, zoom estável e movimento reduzido',async({page,request})=>{
 test.setTimeout(60000);
 await page.route('https://api.maptiler.com/maps/**',r=>r.fulfill({json:{version:8,sources:{},layers:[{id:'bg',type:'background',paint:{'background-color':'#edf1f5'}}]}}));
 await page.setViewportSize({width:1366,height:768});await page.goto('http://localhost:5173');await page.getByLabel('Senha de acesso').fill(process.env.DEMO_ADMIN_PASSWORD!);await page.getByRole('button',{name:'Acessar central'}).click();await expect(page.locator('.vehicle-marker').first()).toBeAttached();
 const result=await request.post('http://127.0.0.1:4000/graphql',{data:{query:'mutation($s:String!){login(email:"central-a@sdv.local",senha:$s){accessToken}}',variables:{s:process.env.DEMO_ADMIN_PASSWORD}}});const token=(await result.json()).data.login.accessToken;
 await request.post('http://127.0.0.1:4000/graphql',{headers:{authorization:`Bearer ${token}`},data:{query:'mutation{configurarSimulacao(fator:1,pausada:false){fator}}'}});
 try{
 await Promise.all([0,1,2].map(async i=>{const r=await request.post('http://127.0.0.1:4000/graphql',{headers:{authorization:`Bearer ${token}`},data:{query:'mutation($i:AbrirOcorrenciaInput!){abrirOcorrencia(input:$i){id}}',variables:{i:{tipo:`Cena de teste ${i}`,descricao:'Despacho simultâneo fictício',enderecoFormatado:'Feira de Santana, teste',origemLocalizacao:'PIN',precisaoLocalizacao:'PONTO',localConfirmado:true,prioridade:3,latitude:-12.26-i*.003,longitude:-38.97,clientRequestId:crypto.randomUUID()}}}});expect((await r.json()).errors).toBeUndefined();}));
 await expect.poll(()=>page.locator('.vehicle-marker[data-status="OCUPADA"]').count()).toBeGreaterThanOrEqual(3);
 const markers=await page.locator('.vehicle-marker').evaluateAll(nodes=>nodes.map(n=>({status:(n as HTMLElement).dataset.status,signal:(n as HTMLElement).dataset.signal,svg:n.innerHTML})));
 for(const m of markers)if(m.signal==='Sinal OK')expect(m.svg).toContain(m.status==='DISPONIVEL'?'#08735a':m.status==='NO_LOCAL'?'#69419c':'#235fa4');
 await page.screenshot({path:'test-results/tres-despachos-cidade.png'});
 await page.locator('.vehicle-marker').first().press('Enter');await expect(page.locator('.operational-sidebar .detail-panel')).toBeVisible();
 await page.locator('.operational-map .maplibregl-ctrl-zoom-in').click();
 const canvas=page.locator('.operational-map .operations-map');await expect.poll(async()=>Number(await canvas.getAttribute('data-zoom'))).toBeGreaterThan(13.9);const zoom=await canvas.getAttribute('data-zoom');
 await page.waitForTimeout(2200);expect(await canvas.getAttribute('data-zoom')).toBe(zoom);
 await page.screenshot({path:'test-results/tres-despachos-bairro.png'});
 await page.locator('.operational-map .maplibregl-ctrl-zoom-in').click();await page.screenshot({path:'test-results/tres-despachos-rua.png'});
 await page.getByRole('button',{name:'Tema escuro'}).click();await expect(page.getByRole('button',{name:'Tema claro'})).toBeVisible();await expect(page.locator('.vehicle-marker').first()).toBeAttached();
 await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'Centralizar cidade'}).click();await expect(page.locator('.vehicle-marker').first()).toBeAttached();
 }finally{
 await request.post('http://127.0.0.1:4000/graphql',{headers:{authorization:`Bearer ${token}`},data:{query:'mutation{configurarSimulacao(fator:12,pausada:false){fator}}'}});
 }
});
