// Controlled six-mech frame work, with GPU completion (not display FPS).
// URL_A / URL_B select production builds; PW_CHANNEL=chrome uses installed Chrome.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const output=process.argv[2] ?? 'ink-perf.json';
(async()=>{
 const browser=await chromium.launch({...(process.env.PW_CHANNEL ? {channel:process.env.PW_CHANNEL} : {}),headless:true,args:['--ignore-gpu-blocklist']}); const results=[];
 for(const [size,width,height,dpr] of [['desk',1280,720,1],['nova',640,480,2]])for(const [tag,mode] of [['a','traced'],['b','geometry'],['b-traced','traced']]){
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:dpr});const errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))errors.push(m.text())});
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;let s=9;Math.random=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};});
  const url=new URL(tag==='a' ? (process.env.URL_A ?? 'http://127.0.0.1:8091/') : (process.env.URL_B ?? 'http://127.0.0.1:8090/'));
  for(const [k,v] of Object.entries({mute:'1',perf:'1',seed:'9',mechLines:mode}))url.searchParams.set(k,v);
  await page.goto(url.href);await page.waitForFunction(()=>window.game,null,{polling:100,timeout:120000});
  await page.evaluate(()=>{const g=window.game,r=g.renderer;g.menus.reset('modes',undefined,['title']);g.loadout.team=4;g.loadout.role=0;g.free.rival=3;g.free.track='helios';g.startFree();g.session.fastForward(95);r.setQuality('high');r.scale=1;r.resize();r.adapt=()=>{};g.tuning.feel.lookThirty=0;g.tuning.feel.lookSteps=60;g.renderer.clearMoments();});
  await page.evaluate(()=>{const g=window.game;g.view.mechs.forEach((v,i)=>v.anim.time=i);});
  const samples=[];
  // GPU completion makes submission costs comparable; no display-vsync cap.
  for(let batch=0;batch<33;batch++)samples.push(...await page.evaluate(({batch})=>{const g=window.game,r=g.renderer,gl=r.renderer.getContext(),out=[];for(let i=0;i<30;i++){const t=performance.now();g.frame(g.last+1000/60);gl.finish();out.push({ms:performance.now()-t,calls:r.renderer.info.render.calls,tris:r.renderer.info.render.triangles});}return batch<3?[]:out;},{batch}));
  const meta=await page.evaluate(()=>{const g=window.game,r=g.renderer,gl=r.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return {gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),resolution:[r.canvas.width,r.canvas.height],mechs:g.session.race.mechs.length,track:g.trackId,probe:JSON.parse(document.querySelector('#render-review').dataset.stats),lods:g.view.mechs.map(v=>v.rig.detailLevels.map(gs=>gs.some(x=>x.visible)))};});
  const avg=k=>samples.reduce((a,v)=>a+v[k],0)/samples.length;const sorted=samples.map(x=>x.ms).sort((a,b)=>a-b);const result={tag,size,...meta,samples:samples.length,meanMs:avg('ms'),p95Ms:sorted[Math.floor(sorted.length*.95)],meanCalls:avg('calls'),meanTriangles:avg('tris'),errors};results.push(result);console.log(JSON.stringify(result));fs.writeFileSync(output,JSON.stringify(results,null,2));await page.close();
 }
 await browser.close();
})();
