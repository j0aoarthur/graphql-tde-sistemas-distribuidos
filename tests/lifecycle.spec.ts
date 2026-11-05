import {test,expect} from '@playwright/test';
test('ciclo completo na interface preserva chegada após F5 e retoma patrulha',async({page,request})=>{
 test.setTimeout(60000);
 await page.route('https://api.maptiler.com/maps/**',r=>r.fulfill({json:{version:8,sources:{},layers:[{id:'bg',type:'background',paint:{'background-color':'#edf1f5'}}]}}));
 await page.route('https://api.maptiler.com/geocoding/**',r=>r.fulfill({json:{features:[{center:[-38.97,-12.26],place_name:'Rua de teste, Feira de Santana, Bahia'}]}}));
 const auth=await request.post('http://127.0.0.1:4000/graphql',{data:{query:'mutation($s:String!){login(email:"central-a@sdv.local",senha:$s){accessToken}}',variables:{s:process.env.DEMO_ADMIN_PASSWORD}}});const token=(await auth.json()).data.login.accessToken;
 async function gql(query:string,variables:Record<string,unknown>={}){const r=await request.post('http://127.0.0.1:4000/graphql',{headers:{authorization:'Bearer '+token},data:{query,variables}});const b=await r.json();expect(b.errors).toBeUndefined();return b.data;}
 await gql('mutation{configurarSimulacao(fator:60,pausada:false){fator}}');
 try{
  await page.goto('http://localhost:5173');await page.getByLabel('Senha de acesso').fill(process.env.DEMO_ADMIN_PASSWORD!);await page.getByRole('button',{name:'Acessar central'}).click();
  await expect.poll(()=>page.locator('.vehicle-marker[data-signal="Sinal OK"]').count(),{timeout:15000}).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Nova ocorrência',exact:true}).click();const title='Ciclo QA '+crypto.randomUUID().slice(0,6);
  await page.getByLabel('Tipo',{exact:true}).fill(title);await page.getByLabel('Descrição',{exact:true}).fill('Ciclo completo fictício pela interface');
  await page.getByLabel('Buscar endereço').fill('Rua de teste');await page.getByRole('option',{name:/Rua de teste.*Endereço aproximado/}).click();await page.getByRole('button',{name:'Confirmar localização',exact:true}).click();
  await expect(page.locator('.location-preview')).toContainText('Estimativa viária');
  const creation=page.waitForResponse(r=>r.url().endsWith('/graphql')&&!!r.request().postData()?.includes('abrirOcorrencia'));
  await page.getByRole('button',{name:'Registrar ocorrência',exact:true}).click();const created=(await (await creation).json()).data.abrirOcorrencia;
  await page.locator('.operation-row').filter({hasText:title}).click();await expect(page.locator('.timeline')).toContainText('Viatura chegou ao local',{timeout:18000});
  const arrival=page.locator('.timeline>div').filter({hasText:'Viatura chegou ao local'}).locator('small').first();const originalTime=await arrival.innerText();
  await page.reload();await page.locator('.operation-row').filter({hasText:title}).click();await expect(page.locator('.timeline>div').filter({hasText:'Viatura chegou ao local'}).locator('small').first()).toHaveText(originalTime);
  const data=await gql('query($id:ID!){consultarOcorrencia(id:$id){viaturaId}}',{id:created.id});const vehicleId=data.consultarOcorrencia.viaturaId;
  await page.getByRole('button',{name:'Encerrar atendimento',exact:true}).click();await expect(page.locator('.timeline')).toContainText('Atendimento concluído',{timeout:12000});
  await expect.poll(async()=>{const d=await gql('query($id:ID!){consultarViatura(id:$id){status patrulhaRota versaoPosicao}}',{id:vehicleId});return d.consultarViatura.status;}).toBe('DISPONIVEL');
  const first=await gql('query($id:ID!){consultarViatura(id:$id){versaoPosicao}}',{id:vehicleId});await expect.poll(async()=>{const d=await gql('query($id:ID!){consultarViatura(id:$id){versaoPosicao}}',{id:vehicleId});return d.consultarViatura.versaoPosicao;},{timeout:12000}).toBeGreaterThan(first.consultarViatura.versaoPosicao);
  await page.screenshot({path:'test-results/ciclo-completo-timeline.png'});
 }finally{await gql('mutation{configurarSimulacao(fator:12,pausada:false){fator}}');}
});
