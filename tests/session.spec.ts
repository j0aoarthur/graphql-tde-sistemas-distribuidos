import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{await page.route('https://api.maptiler.com/maps/**',r=>r.fulfill({json:{version:8,sources:{},layers:[{id:'bg',type:'background',paint:{'background-color':'#edf1f5'}}]}}));});
test('restaura sessão após F5, duas abas e revoga logout',async({page,context})=>{
 await page.goto('http://localhost:5173');
 await page.getByLabel('Senha de acesso').fill(process.env.DEMO_ADMIN_PASSWORD!);
 await page.getByRole('button',{name:'Acessar central'}).click();
 await expect(page.locator('.sidebar-user')).toBeVisible();
 await page.reload();
 await expect(page.locator('.sidebar-user')).toBeVisible();
 expect(await page.evaluate(()=>Object.keys(localStorage))).toEqual([]);
 expect(await page.evaluate(()=>Object.keys(sessionStorage))).toEqual([]);
 const cookies=await context.cookies();const session=cookies.find(c=>c.name==='sdv_refresh')!;
 expect(session.httpOnly).toBe(true);expect(session.sameSite).toBe('Strict');
 const second=await context.newPage();await second.goto('http://localhost:5173');
 await Promise.all([page.reload(),second.reload()]);
 await expect(page.locator('.sidebar-user')).toBeVisible();await expect(second.locator('.sidebar-user')).toBeVisible();
 await page.screenshot({path:'test-results/session-desktop.png'});
 await page.locator('.sidebar-user').click();
 await expect(page.getByRole('button',{name:'Acessar central'})).toBeVisible();
 await second.reload();await expect(second.getByRole('button',{name:'Acessar central'})).toBeVisible();
 await page.reload();await expect(page.getByRole('button',{name:'Acessar central'})).toBeVisible();
});

test('renova uma vez após credencial HTTP expirada',async({page})=>{
 await page.goto('http://localhost:5173');
 await page.getByLabel('Senha de acesso').fill(process.env.DEMO_ADMIN_PASSWORD!);
 await page.getByRole('button',{name:'Acessar central'}).click();
 await expect(page.locator('.sidebar-user')).toBeVisible();
 let rejected=false,refreshes=0;
 page.on('request',req=>{if(req.url().endsWith('/auth/refresh'))refreshes++;});
 await page.route('**/graphql',async route=>{
  if(!rejected){rejected=true;await route.fulfill({json:{errors:[{message:'Token inválido',extensions:{code:'UNAUTHENTICATED'}}]}});}else await route.continue();
 });
 await page.getByTitle('Atualizar dados',{exact:true}).click();
 await expect.poll(()=>refreshes,{timeout:18000}).toBe(1);
 await expect(page.locator('.sidebar-user')).toBeVisible();
});
