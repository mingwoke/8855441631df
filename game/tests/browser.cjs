// Real Chromium rendering and interaction checks. No production debug hooks.
// Run: node tests/browser.cjs (Playwright and a Chromium installation required).
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const http=require('node:http');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),output=path.join(root,'verification');
fs.mkdirSync(output,{recursive:true});
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const f=path.resolve(root,'dist','.'+(pathname==='/'?'/index.html':pathname));
 if(!f.startsWith(path.join(root,'dist')+path.sep)){res.writeHead(403).end();return;}
 fs.readFile(f,(err,data)=>{if(err){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'})[path.extname(f)]||'application/octet-stream');res.end(data);});
});
let checks=0;const results=[];
function pass(name){checks++;results.push(name);console.log('PASS '+name);}
async function capture(page,options){
 const cdp=await page.context().newCDPSession(page);
 try{
  const metrics=await cdp.send('Page.getLayoutMetrics');
  if(metrics.cssVisualViewport.zoom!==1){
   // Playwright's fullPage clipping assumes zoom=1; use actual device-pixel
   // content bounds so native browser zoom does not crop the screenshot.
   const shot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{...metrics.contentSize,scale:1}});
   const png=Buffer.from(shot.data,'base64');assert.equal(png.readUInt32BE(16),metrics.contentSize.width);fs.writeFileSync(options.path,png);
  }else await page.screenshot(options);
 }finally{await cdp.detach();}
}
async function instrument(page,denyStorage=false){
 await page.clock.install();
 await page.addInitScript(deny=>{
  let seed=315;const random=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
  let api;
  Object.defineProperty(window,'AsaraGame',{configurable:true,get(){return api},set(v){const Base=v.Game;v.Game=class extends Base{constructor(){super(random);window.__game=this;}};api=v;}});
  window.__intervals=0;const original=window.setInterval;window.setInterval=(...args)=>{window.__intervals++;return original(...args);};
  if(deny)Object.defineProperty(window,'localStorage',{get(){throw new Error('Storage disabled for regression test');}});
 },denyStorage);
}
async function layout(page,label){
 const faults=await page.evaluate(()=>{
  const errors=[],r=s=>document.querySelector(s).getBoundingClientRect();
  if(document.documentElement.scrollWidth>innerWidth+1)errors.push('horizontal overflow');
  const sequence=['.tabs','.quote','#ohlc','#plot','.chart-bottom','.chart-meta','#inspectText'];
  for(let i=1;i<sequence.length;i++)if(r(sequence[i-1]).bottom>r(sequence[i]).top+1)errors.push(sequence[i]+' overlaps predecessor');
  const chart=r('#plot'),learning=r('.learning'),wallet=r('.wallet'),actions=r('.actions');
  if(chart.height<190)errors.push('chart compressed');
  if(learning.top<chart.bottom)errors.push('knowledge covers chart');
  if(wallet.top<learning.bottom-1)errors.push('wallet covers knowledge');
  if(!(wallet.right<=actions.left+1||actions.right<=wallet.left+1||wallet.bottom<=actions.top+1||actions.bottom<=wallet.top+1))errors.push('position overlaps actions');
  for(const sel of ['.tabs','.ohlc','.chart-bottom','#inspectText','.news','.wallet','.actions','.feedback']){
   const e=document.querySelector(sel);if(e.scrollWidth>e.clientWidth+2)errors.push(sel+' clips horizontally');
  }
  if(document.body.innerText.includes('¥'))errors.push('RMB symbol');
  if([...document.querySelectorAll('img')].some(e=>!e.complete||!e.naturalWidth))errors.push('missing image');
  return errors;
 });
 assert.deepEqual(faults,[],label);
 for(const id of ['historyRange','zoomIn','zoomOut','liveButton','buyButton','sellButton','workButton','halfButton']){
  const element=page.locator('#'+id);await element.scrollIntoViewIfNeeded();
  const hit=await element.evaluate(e=>{const r=e.getBoundingClientRect(),t=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return t===e||e.contains(t);});
  assert(hit,label+' blocked hit target: '+id);
 }
 pass(label+' — no overlap, clipping or blocked chart/trade controls');
}
async function mapAlignment(page,label){
 if(await page.locator('#mapToggle').isVisible()&&await page.locator('#mapToggle').getAttribute('aria-expanded')==='false')await page.locator('#mapToggle').click();
 const geometry=await page.evaluate(()=>{
  const pin=document.querySelector('#mapMarker'),p=AsaraGame.LOCATIONS[__game.mapState.location];
  const map=document.querySelector('#fieldMap'),expected=new DOMPoint(p.x,p.y).matrixTransform(map.getScreenCTM()),actual=new DOMPoint(0,0).matrixTransform(pin.getScreenCTM());
  return {dx:actual.x-expected.x,dy:actual.y-expected.y,visible:pin.getAttribute('visibility'),count:document.querySelectorAll('#fieldMap .map-active').length};
 });
 assert(Math.abs(geometry.dx)<.01&&Math.abs(geometry.dy)<.01);assert.equal(geometry.visible,'visible');assert.equal(geometry.count,1);
 await page.locator('#expandMap').click();assert(await page.locator('#mapOverlay').isVisible());
 assert(await page.locator('#app').evaluate(e=>e.inert));
 await capture(page,{path:path.join(output,label+'-map.png'),fullPage:true});
 await page.keyboard.press('Escape');assert(await page.locator('#mapOverlay').isHidden());
 if(await page.locator('#mapToggle').isVisible())await page.locator('#mapToggle').click();
 pass(label+' — original-map pin aligned at both sizes; map dialog keyboard close');
}
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const executablePath=process.env.CHROMIUM_PATH||'/usr/bin/chromium';
 const browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox']});
 const errors=[],limitations=[];let zoomContext;
 try{
  for(const [label,width,height,isMobile] of [['desktop',1366,768,false],['wide',1920,1080,false],['mobile',390,844,true],['small-phone',320,568,true],['small-window',800,600,false]]){
   const context=await browser.newContext({viewport:{width,height},isMobile,hasTouch:isMobile,deviceScaleFactor:1});
   const page=await context.newPage();page.on('pageerror',e=>errors.push(label+': '+e.message));await instrument(page);await page.goto(base);await page.evaluate(()=>document.fonts.ready);
   assert(await page.locator('#app').isHidden());assert.equal(await page.locator('.chart-cover').evaluate(e=>getComputedStyle(e).overflow),'visible');
   await capture(page,{path:path.join(output,label+'-start.png'),fullPage:true});
   await page.locator('#startButton').click();await page.locator('#buyButton').click();assert.match(await page.locator('#feeText').innerText(),/4.98 哈夫币/);
   await page.clock.runFor(61000);assert.equal(await page.evaluate(()=>__game.news.id),'gti-action');
   await layout(page,label);await mapAlignment(page,label);
   await page.evaluate(()=>scrollTo(0,0));await capture(page,{path:path.join(output,label+'-playing.png'),fullPage:true});
   // Clicking the actual rendered news marker opens the corresponding news.
   const marker=page.locator('#chart g[data-index="12"]').filter({has:page.locator('text', {hasText:'!'})});
   await marker.click();assert.match(await page.locator('#inspectText').innerText(),/截获通讯.*水泥厂外桥头/);
   const ticks=await page.evaluate(()=>__game.ticks);await page.clock.runFor(1000);assert.equal(await page.evaluate(()=>__game.ticks),ticks+1);assert.match(await page.locator('#connectionState').innerText(),/回看/);
   await page.locator('#historyRange').focus();await page.keyboard.press('Home');assert.equal(await page.locator('#historyRange').inputValue(),'0');assert.match(await page.locator('#inspectText').innerText(),/费用 4.98 哈夫币/);
   await page.locator('#pauseButton').click();const pausedTicks=await page.evaluate(()=>__game.ticks);await page.clock.runFor(2000);assert.equal(await page.evaluate(()=>__game.ticks),pausedTicks);assert(await page.locator('#buyButton').isDisabled());
   await page.locator('#zoomIn').click();await page.locator('#liveButton').click();assert(await page.locator('#chartCover').isHidden());
   await page.evaluate(()=>scrollTo(0,0));await capture(page,{path:path.join(output,label+'-paused.png'),fullPage:true});
   pass(label+' — news/trade markers, touch-sized controls, history, zoom and pause');
   if(label==='desktop'){
    await page.locator('#pauseButton').click();
    // Trigger the real browser's background lifecycle using CDP, rather than a DOM shim.
    const cdp=await context.newCDPSession(page);await cdp.send('Page.setWebLifecycleState',{state:'frozen'});await cdp.send('Page.setWebLifecycleState',{state:'active'});
    // visibilitychange on freeze is platform-dependent; explicit pagehide is tested below too.
    await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')));
    assert.equal(await page.evaluate(()=>__game.status),'paused');await page.clock.runFor(1000);assert.equal(await page.evaluate(()=>__game.status),'paused');
    await page.locator('#pauseButton').click();
    await page.clock.runFor(179000);await page.locator('#pauseButton').click();assert.equal(await page.locator('#dayValue').innerText(),'13');
    await capture(page,{path:path.join(output,'day13-paused.png'),fullPage:true});
    await page.locator('#pauseButton').click();await page.clock.runFor((600-await page.evaluate(()=>__game.ticks))*1000+100);assert.equal(await page.evaluate(()=>__game.ticks),600);assert(await page.locator('#endOverlay').isVisible());
    assert.equal(await page.evaluate(()=>Object.keys(localStorage).join(',')),'asara.best.v1');await capture(page,{path:path.join(output,'result.png'),fullPage:true});
    await page.locator('#restartButton').click();assert.equal(await page.evaluate(()=>__game.ticks),0);assert.equal(await page.evaluate(()=>__intervals),1);assert.equal(await page.locator('#cashValue').innerText(),'10,000');assert.equal(await page.locator('#mapMarker').getAttribute('visibility'),'hidden');
    await page.locator('#workButton').click();await page.locator('#workButton').evaluate(e=>e.click());assert.equal(await page.evaluate(()=>__game.ticks),20);assert.equal(await page.evaluate(()=>__game.wages),50000);
    pass('desktop — full 30-day timer, result, best-score storage, restart and work double-click protection');
   }
   await context.close();
  }
  // Use Chromium's real browser zoom setting (not CSS zoom or device emulation).
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'asara-browser-zoom-'));
  zoomContext=await chromium.launchPersistentContext(profile,{executablePath,headless:true,viewport:{width:1366,height:768},args:['--no-sandbox']});
  const settings=await zoomContext.newPage();await settings.goto('chrome://settings/appearance',{waitUntil:'domcontentloaded'});
  await settings.evaluate(()=>new Promise(resolve=>chrome.settingsPrivate.setDefaultZoom(2,resolve)));
  const zoomPage=await zoomContext.newPage();zoomPage.on('pageerror',e=>errors.push('zoom: '+e.message));await instrument(zoomPage);await zoomPage.goto(base);await zoomPage.bringToFront();await settings.close();
  assert.deepEqual(await zoomPage.evaluate(()=>[innerWidth,innerHeight,devicePixelRatio]),[683,384,2]);
  await capture(zoomPage,{path:path.join(output,'native-200-percent-start.png'),fullPage:true});await zoomPage.locator('#startButton').click();await zoomPage.clock.runFor(61000);await layout(zoomPage,'native browser 200%');await mapAlignment(zoomPage,'native-200-percent');
  await zoomPage.evaluate(()=>scrollTo(0,0));await capture(zoomPage,{path:path.join(output,'native-200-percent-playing.png'),fullPage:true});await zoomContext.close();zoomContext=null;
  pass('native browser 200% — confirmed 1366×768 screen / 683×384 CSS viewport / DPR 2');
  // The exported files must also work directly, without HTTP, network or storage.
  const offline=await browser.newContext({offline:true});const file=await offline.newPage();file.on('pageerror',e=>errors.push('offline: '+e.message));await instrument(file,true);try{await file.goto(pathToFileURL(path.join(root,'dist/index.html')).href);}catch(e){
   if(!e.message.includes('ERR_BLOCKED_BY_ADMINISTRATOR'))throw e;
   limitations.push('This managed Chromium blocks file:// URLs (ERR_BLOCKED_BY_ADMINISTRATOR); direct-file loading was not validated.');
   console.log('LIMITATION file:// navigation blocked by managed browser policy; checking network-off gameplay after local HTTP load.');
   await offline.setOffline(false);await file.goto(base);await file.locator('.coin img').first().waitFor({state:'attached'});await file.evaluate(()=>Promise.all([...document.images].map(img=>img.decode())));await offline.setOffline(true);
  }
  await file.locator('#startButton').click();await file.locator('#workButton').click();assert.equal(await file.evaluate(()=>__game.cash),1050000);
  assert(await file.locator('.coin img').first().evaluate(e=>e.complete&&e.naturalWidth===401));
  await file.evaluate(()=>{__game.cash=AsaraGame.TARGET;});await file.clock.runFor(1000);assert(await file.locator('#endOverlay').isVisible());assert.match(await file.locator('#recordNote').innerText(),/禁止本地存储/);await file.locator('#restartButton').click();assert.equal(await file.evaluate(()=>__intervals),1);await offline.close();
  pass('network-off gameplay after asset load — original assets, immediate win and blocked storage');
  assert.deepEqual(errors,[]);pass('all browser scenarios — no uncaught JavaScript errors');
  fs.writeFileSync(path.join(output,'browser-results.json'),JSON.stringify({browser:await browser.version(),checks,results,errors,limitations,nativeZoom:{screen:[1366,768],cssViewport:[683,384],devicePixelRatio:2},note:'Chromium desktop rendering with mobile viewport/touch emulation; not physical iOS/Android testing.'},null,2)+'\n');
  console.log('\n'+checks+' real-browser checks passed.');
 }finally{await zoomContext?.close();await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
