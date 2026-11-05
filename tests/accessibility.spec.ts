import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('contraste WCAG AA e texto funcional no workspace',async({page})=>{
 await page.route('https://api.maptiler.com/maps/**',r=>r.fulfill({json:{version:8,sources:{},layers:[{id:'bg',type:'background',paint:{'background-color':'#edf1f5'}}]}}));
 await page.goto('http://localhost:5173');await page.getByLabel('Senha de acesso').fill(process.env.DEMO_ADMIN_PASSWORD!);await page.getByRole('button',{name:'Acessar central'}).click();await expect(page.locator('.vehicle-marker').first()).toBeAttached();
 const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze();
 expect(result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({html:n.html,summary:n.failureSummary}))}))).toEqual([]);
 const tiny=await page.locator('.operational-workspace,.operational-kpis').evaluateAll(roots=>roots.flatMap(root=>Array.from(root.querySelectorAll('*'))).filter(e=>e.children.length===0&&e.textContent?.trim()&&e.getBoundingClientRect().width>0&&parseFloat(getComputedStyle(e).fontSize)<13).map(e=>e.textContent));expect(tiny).toEqual([]);
});
