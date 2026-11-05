import {test,expect} from '@playwright/test';
test.use({ignoreHTTPSErrors:true});
test('cookie Secure e sessão após reload em proxy HTTPS local',async({page,context})=>{
 await page.route('https://api.maptiler.com/maps/**',r=>r.fulfill({json:{version:8,sources:{},layers:[{id:'bg',type:'background',paint:{'background-color':'#edf1f5'}}]}}));
 await page.goto('https://localhost:5443');await page.getByLabel('Senha de acesso').fill(process.env.DEMO_ADMIN_PASSWORD!);await page.getByRole('button',{name:'Acessar central'}).click();await expect(page.locator('.sidebar-user')).toBeVisible();
 const cookie=(await context.cookies()).find(c=>c.name==='sdv_refresh')!;expect(cookie.secure).toBe(true);expect(cookie.httpOnly).toBe(true);expect(cookie.sameSite).toBe('Strict');expect(cookie.path).toBe('/auth');
 await page.reload();await expect(page.locator('.sidebar-user')).toBeVisible();await page.locator('.sidebar-user').click();await page.reload();await expect(page.getByRole('button',{name:'Acessar central'})).toBeVisible();
});
