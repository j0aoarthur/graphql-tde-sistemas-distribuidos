import {test,expect} from '@playwright/test';
test('sinal atrasado congela marcador e informa o horário',async({page})=>{
 test.setTimeout(45000);
 await page.route('https://api.maptiler.com/maps/**',r=>r.fulfill({json:{version:8,sources:{},layers:[{id:'bg',type:'background',paint:{'background-color':'#edf1f5'}}]}}));
 await page.goto('http://localhost:5173');await page.getByLabel('Senha de acesso').fill(process.env.DEMO_ADMIN_PASSWORD!);await page.getByRole('button',{name:'Acessar central'}).click();await expect(page.locator('.vehicle-marker').first()).toBeAttached();
 await page.getByRole('button',{name:'Laboratório',exact:true}).click();await page.getByRole('button',{name:'Simular perda de sinal (0 min 20 s)'}).click();
 await page.getByRole('button',{name:'Central operacional',exact:true}).click();
 const stale=page.locator('.vehicle-marker[data-signal="Sinal atrasado"]').first();await expect(stale).toBeAttached({timeout:16000});
 const initial=await stale.boundingBox();await page.waitForTimeout(2000);const later=await stale.boundingBox();expect(later?.x).toBeCloseTo(initial!.x,0);expect(later?.y).toBeCloseTo(initial!.y,0);
 await expect(stale).toHaveAttribute('aria-label',/Último sinal:/);await page.screenshot({path:'test-results/sinal-atrasado.png'});
});
