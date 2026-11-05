import {test,expect} from '@playwright/test';
import {decode,sign,type JwtPayload} from 'jsonwebtoken';
test('expiração real do JWT fecha WS e restaura credencial sem logout',async({page})=>{
 test.setTimeout(30000);let sockets=0,refreshes=0;
 page.on('websocket',socket=>{if(socket.url().includes('/subscriptions'))sockets++;});
 page.on('request',r=>{if(r.url().endsWith('/auth/refresh'))refreshes++;});
 await page.route('https://api.maptiler.com/maps/**',r=>r.fulfill({json:{version:8,sources:{},layers:[{id:'bg',type:'background',paint:{'background-color':'#edf1f5'}}]}}));
 await page.route('**/auth/login',async route=>{const response=await route.fetch();const data=await response.json();const claims=decode(data.accessToken) as JwtPayload;data.accessToken=sign({...claims,exp:Math.floor(Date.now()/1000)+8},process.env.JWT_SECRET!,{algorithm:'HS256'});await route.fulfill({response,json:data});});
 await page.goto('http://localhost:5173');await page.getByLabel('Senha de acesso').fill(process.env.DEMO_ADMIN_PASSWORD!);await page.getByRole('button',{name:'Acessar central'}).click();await expect(page.locator('.sidebar-user')).toBeVisible();const initialRefreshes=refreshes;
 await expect.poll(()=>sockets,{timeout:18000}).toBeGreaterThanOrEqual(2);
 await expect.poll(()=>refreshes).toBeGreaterThan(initialRefreshes);await expect(page.locator('.sidebar-user')).toBeVisible();await expect(page.locator('.top-live')).toContainText('TEMPO REAL');
});
