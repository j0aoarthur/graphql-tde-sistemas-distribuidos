import {test,expect} from '@playwright/test';
// ViaCEP e MapTiler são mockados: o teste valida o preenchimento dos campos, não a disponibilidade dos provedores.
const CEP={cep:'44077-340',logradouro:'Rua São João Batista',bairro:'Santa Mônica',localidade:'Feira de Santana',uf:'BA'};
async function fixtures(page:any){
 await page.route('https://api.maptiler.com/maps/**',(route:any)=>route.fulfill({json:{version:8,sources:{},layers:[{id:'bg',type:'background',paint:{'background-color':'#edf1f5'}}]}}));
 await page.route('https://api.maptiler.com/geocoding/**',(route:any)=>{
  const reverse=/%2C|,/.test(new URL(route.request().url()).pathname);
  // Reverso sem bairro/CEP: obriga o painel a completar pelo ViaCEP a partir da rua.
  return route.fulfill({json:{features:[{id:'address.t',place_type:['address'],text:'Rua São João Batista',geometry:{type:'Point',coordinates:[-38.969,-12.26]},address:reverse?undefined:'10',place_name:'Rua São João Batista, Feira de Santana, Bahia',context:reverse?[]:[{id:'neighbourhood.x',text:'Santa Mônica'}]}]}});
 });
 await page.route('https://viacep.com.br/**',(route:any)=>{
  const path=new URL(route.request().url()).pathname;
  // Busca por rua devolve lista; consulta por CEP devolve objeto.
  return route.fulfill({json:path.startsWith('/ws/BA/')?[CEP]:CEP});
 });
}
async function open(page:any){
 await fixtures(page);await page.goto('http://localhost:5173');
 await page.getByLabel('Senha de acesso').fill(process.env.DEMO_ADMIN_PASSWORD!);await page.getByRole('button',{name:'Acessar central'}).click();
 await expect(page.locator('.operational-workspace')).toBeVisible();
 await page.getByRole('button',{name:'Nova ocorrência',exact:true}).click();
}
test('CEP digitado na busca preenche bairro e CEP sem precisar escolher a sugestão',async({page})=>{
 await open(page);
 await page.getByLabel('Buscar endereço').fill('44077340');
 await expect(page.getByLabel('Bairro',{exact:true})).toHaveValue('Santa Mônica');
 await expect(page.getByLabel('CEP',{exact:true})).toHaveValue('44077-340');
 await expect(page.getByRole('dialog')).toContainText('Rua São João Batista · Santa Mônica');
 await page.getByRole('option',{name:/Rua São João Batista.*CEP aproximado/}).click();
 await expect(page.getByLabel('Bairro',{exact:true})).toHaveValue('Santa Mônica');
 await expect(page.getByLabel('CEP',{exact:true})).toHaveValue('44077-340');
});
test('CEP digitado no próprio campo consulta o ViaCEP e preenche o bairro',async({page})=>{
 await open(page);
 await page.getByLabel('CEP',{exact:true}).fill('44077340');
 await expect(page.getByLabel('CEP',{exact:true})).toHaveValue('44077-340');
 await expect(page.getByLabel('Bairro',{exact:true})).toHaveValue('Santa Mônica');
});
test('clique no mapa completa CEP e bairro pelo ViaCEP quando o geocoder não os traz',async({page})=>{
 await open(page);
 await page.getByRole('dialog').locator('.maplibregl-canvas').click({position:{x:140,y:150}});
 await expect(page.getByLabel('Local selecionado')).toBeVisible();
 await expect(page.getByLabel('CEP',{exact:true})).toHaveValue('44077-340');
 await expect(page.getByLabel('Bairro',{exact:true})).toHaveValue('Santa Mônica');
});
test('campos obrigatórios marcados e pendências listadas',async({page})=>{
 await open(page);
 const dialog=page.getByRole('dialog');
 await expect(dialog.locator('.required-legend')).toContainText('Campo obrigatório');
 for(const name of ['Local da ocorrência','Tipo','Prioridade','Descrição'])await expect(dialog.locator('label',{hasText:name}).first().locator('.req')).toHaveCount(1);
 for(const name of ['Bairro','CEP','Número','Complemento','Observações'])await expect(dialog.locator('label',{hasText:name}).first().locator('.opt')).toHaveCount(1);
 await expect(dialog.locator('.pending-fields')).toContainText('local da ocorrência');
 await expect(dialog.locator('.pending-fields')).toContainText('descrição');
 await expect(page.getByRole('button',{name:'Registrar ocorrência',exact:true})).toBeDisabled();
 // Os asteriscos são decorativos: não podem alterar o nome acessível dos campos.
 await expect(page.getByLabel('Descrição',{exact:true})).toBeVisible();await expect(page.getByLabel('CEP',{exact:true})).toBeVisible();
});
