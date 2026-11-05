import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('navegação ampla, mapa dedicado, prioridades e formulário sem emojis',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.route('https://api.maptiler.com/maps/**',r=>r.fulfill({json:{version:8,sources:{},layers:[{id:'bg',type:'background',paint:{'background-color':'#edf1f5'}}]}}));
 await page.goto('http://localhost:5173');await page.getByLabel('Senha de acesso').fill(process.env.DEMO_ADMIN_PASSWORD!);await page.getByRole('button',{name:'Acessar central'}).click();
 await expect(page.getByRole('heading',{name:'Fila de atendimento'})).toBeVisible();expect((await page.locator('.sidebar').boundingBox())!.width).toBeGreaterThanOrEqual(250);
 await page.getByRole('navigation').getByRole('button',{name:'Mapa operacional'}).click();await expect(page.getByRole('region',{name:'Exploração geográfica'})).toBeVisible();await expect(page.locator('.operational-kpis')).toHaveCount(0);await expect(page.getByRole('heading',{name:'Fila de atendimento'})).toHaveCount(0);
 await page.getByRole('button',{name:'Em patrulha',exact:true}).click();await expect(page.locator('.vehicle-marker[data-status="OCUPADA"]')).toHaveCount(0);
 await page.getByLabel('Mostrar todas as rotas').check();await expect(page.getByLabel('Mostrar todas as rotas')).toBeChecked();
 await page.screenshot({path:'test-results/mapa-dedicado.png'});
 await page.getByRole('button',{name:'Nova ocorrência',exact:true}).click();
 const select=page.getByLabel('Prioridade',{exact:true});await expect(select.locator('option')).toHaveText(['1 · Baixa','2 · Moderada','3 · Alta','4 · Urgente','5 · Crítica']);
 const colors=[];for(const value of ['1','2','3','4','5']){await select.selectOption(value);colors.push(await select.evaluate(el=>getComputedStyle(el).color));}expect(new Set(colors).size).toBe(5);
 await expect(page.getByRole('button',{name:'Fechar',exact:true}).locator('svg')).toHaveCount(1);
 const accessibility=await new AxeBuilder({page}).include('.create-incident').withTags(['wcag2a','wcag2aa']).analyze();expect(accessibility.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.failureSummary)}))).toEqual([]);
 expect(await page.locator('body').innerText()).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
 await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('trecho restante, interpolação confirmada e tempos em minutos e segundos',async({page})=>{
 await page.goto('http://localhost:5173');
 const result=await page.evaluate(async()=>{
  const motion='/src/lib/map-motion.ts',presentation='/src/lib/presentation.ts';const {remainingRoute,interpolateSamples}=await import(/* @vite-ignore */ motion);const {formatDuration}=await import(/* @vite-ignore */ presentation);
  const route=[[-12.26,-38.97],[-12.26,-38.96],[-12.25,-38.96]],base={route,raw:JSON.stringify(route),heading:90};
  const samples=[{...base,time:1000,progress:.1,point:route[0]},{...base,time:2000,progress:.6,point:route[1]}];
  return {remaining:remainingRoute(route,.7),finished:remainingRoute(route,1),sample:interpolateSamples(samples,1500),frozen:interpolateSamples(samples,9000),times:[formatDuration(0),formatDuration(75),formatDuration(3605),formatDuration(null)]};
 });
 expect(result.remaining).toHaveLength(2);expect(result.remaining[0][0]).toBeGreaterThan(-12.26);expect(result.finished).toEqual([]);expect(result.sample.point[0]).toBeCloseTo(-12.26,5);expect(result.sample.progress).toBeCloseTo(.35);expect(result.frozen.progress).toBe(.6);expect(result.times).toEqual(['0 min 00 s','1 min 15 s','60 min 05 s','Indisponível']);
});
