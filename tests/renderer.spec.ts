import {test,expect} from '@playwright/test';
test('renderizador interpola na curva sem cortar quarteirão',async({page})=>{
 await page.setViewportSize({width:1000,height:800});
 await page.route('https://api.maptiler.com/maps/**',r=>r.fulfill({json:{version:8,sources:{},layers:[{id:'bg',type:'background',paint:{'background-color':'#edf1f5'}}]}}));
 await page.goto('http://localhost:5173');
 await page.evaluate(async()=>{
  const path='/src/components/OperationsMap.tsx';const {OperationsMap,along}=await import(/* @vite-ignore */ path);
  const modules=await (await fetch('/src/main.tsx')).text();const reactPath=modules.match(/"([^"]*\/react\.js[^"]*)"/)![1],domPath=modules.match(/"([^"]*react-dom_client\.js[^"]*)"/)![1];const React=(await import(/* @vite-ignore */ reactPath)).default;const {createRoot}=await import(/* @vite-ignore */ domPath);
  const host=document.createElement('div');host.id='renderer-test';Object.assign(host.style,{position:'fixed',inset:'0',zIndex:'9999'});document.body.append(host);const root=createRoot(host);
  const route=[[-12.260,-38.966],[-12.260,-38.962],[-12.256,-38.962]];let version=0;
  (window as any).renderFrame=(progress:number)=>{const p=along(route,progress);version++;root.render(React.createElement(OperationsMap,{vehicles:[{id:'render-car',placa:'TESTE',status:'OCUPADA',latitude:p[0],longitude:p[1],versao:version,capacidade:2,ultimoSinalEm:new Date().toISOString(),direcaoGraus:90}],incidents:[],dispatches:[{id:'render-dispatch',viaturaId:'render-car',ocorrenciaId:'render-incident',status:'EM_DESLOCAMENTO',progresso:progress,rota:JSON.stringify(route)}]}));};
  (window as any).renderFrame(.2);
 });
 await expect(page.locator('#renderer-test .vehicle-marker')).toBeVisible();
 const points=await page.evaluate(async()=>{
  const marker=document.querySelector('#renderer-test .vehicle-marker')!;
  (window as any).renderFrame(.8);const samples:Array<{x:number;y:number}>=[];
  for(let i=0;i<90;i++){await new Promise(requestAnimationFrame);const b=marker.getBoundingClientRect();samples.push({x:b.x+b.width/2,y:b.y+b.height/2});}return samples;
 });
 function project(lat:number,lon:number){const size=512*2**13;const merc=(v:number)=>Math.log(Math.tan(Math.PI/4+v*Math.PI/360));return {x:500+(lon+38.966)/360*size,y:400-(merc(lat)-merc(-12.260))/(2*Math.PI)*size};}
 const a=project(-12.260,-38.966),b=project(-12.260,-38.962);
 expect(new Set(points.map(p=>Math.round(p.x)+','+Math.round(p.y))).size).toBeGreaterThan(5);
 for(const p of points)expect(Math.min(Math.abs(p.y-a.y),Math.abs(p.x-b.x))).toBeLessThan(4);
 await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>(window as any).renderFrame(.9));await expect(page.locator('#renderer-test .vehicle-marker')).toBeVisible();
});
