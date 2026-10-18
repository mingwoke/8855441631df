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
 await page.clock.install({time:new Date('2026-10-15T12:00:00Z')});
 await page.clock.pauseAt(new Date('2026-10-15T12:00:01Z'));
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
  const errors=[],r=s=>document.querySelector(s).getBoundingClientRect(),visible=s=>!!document.querySelector(s).getClientRects().length;
  if(document.documentElement.scrollWidth>innerWidth+1)errors.push('horizontal overflow');
  if(document.documentElement.scrollHeight>innerHeight+1)errors.push('vertical overflow');
  const chart=r('#plot'),learning=r('.learning'),wallet=r('.wallet'),actions=r('.actions');
  if(chart.height<110)errors.push('chart compressed');
  for(const sel of ['.chart-bottom','.chart-meta'])if(r(sel).top<chart.bottom-1)errors.push(sel+' covers chart');
  if(learning.top<chart.bottom)errors.push('knowledge covers chart');
  if(learning.top<actions.bottom-1)errors.push('knowledge covers actions');
  if(!(wallet.right<=actions.left+1||actions.right<=wallet.left+1||wallet.bottom<=actions.top+1||actions.bottom<=wallet.top+1))errors.push('position overlaps actions');
  for(const sel of ['.tabs','.chart-bottom','.wallet','.actions','.feedback','.topbar']){
   const e=document.querySelector(sel);if(visible(sel)&&e.scrollWidth>e.clientWidth+2)errors.push(sel+' clips horizontally');
  }
  for(const sel of ['#buyButton','#sellButton','#workButton','#halfButton','#customButton','#pauseButton','.wallet','.screen-footer']){
   const q=r(sel);if(q.top<0||q.bottom>innerHeight+1||q.left<0||q.right>innerWidth+1)errors.push(sel+' outside viewport');
  }
  if(document.body.innerText.includes('¥'))errors.push('RMB symbol');
  if([...document.querySelectorAll('img')].some(e=>!e.complete||!e.naturalWidth))errors.push('missing image');
  return errors;
 });
 assert.deepEqual(faults,[],label);
 for(const id of ['chart','range3','range7','rangeAll','historyPrev','historyNext','buyButton','sellButton','workButton','halfButton','quarterButton','threeQuarterButton','customButton']){
  const element=page.locator('#'+id);assert(await element.isVisible());
  const hit=await element.evaluate(e=>{const r=e.getBoundingClientRect(),t=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return t===e||e.contains(t);});
  assert(hit,label+' blocked hit target: '+id);
 }
 pass(label+' — one viewport, no scrolling, overlapping or blocked chart/trade controls');
}
async function mapAlignment(page,label){
 const mobile=await page.locator('#mapToggle').isVisible();if(mobile)await page.locator('#mapToggle').click();
 const geometry=await page.evaluate(mobile=>{
  const pin=document.querySelector(mobile?'#readerMapMarker':'#mapMarker'),p=AsaraGame.LOCATIONS[__game.mapState.location];
  const map=document.querySelector(mobile?'#readerMap':'#fieldMap'),expected=new DOMPoint(p.x,p.y).matrixTransform(map.getScreenCTM()),actual=new DOMPoint(0,0).matrixTransform(pin.getScreenCTM());
  return {dx:actual.x-expected.x,dy:actual.y-expected.y,count:map.querySelectorAll('.map-active').length};
 },mobile);
 assert(Math.abs(geometry.dx)<.01&&Math.abs(geometry.dy)<.01);assert.equal(geometry.count,1);
 assert.equal(await page.locator('#expandMap, #mapOverlay').count(),0);
 await capture(page,{path:path.join(output,label+'-map.png'),fullPage:true});
 if(mobile)await page.locator('#readerClose').click();
 pass(label+' — original-map pin aligned; narrow layout opens a situation reader');
}
async function selectStock(page,index){if(await page.locator('#stockSelect').isVisible())await page.locator('#stockSelect').selectOption(String(index));else await page.locator('#stock'+index).click();}
async function newsControl(page){return await page.locator('#newsArchive').isVisible()?page.locator('#newsArchive'):page.locator('#newsTicker');}
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
   assert(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1&&document.documentElement.scrollWidth<=innerWidth+1));assert.equal(await page.locator('.cover-lore,#loreSummary').count(),0);await capture(page,{path:path.join(output,label+'-start.png'),fullPage:true});
   await page.locator('#startButton').click();assert.match(await page.locator('#buyPreview').innerText(),/249 股.*4,984.98/);await page.locator('#buyButton').click();assert.match(await page.locator('#feeText').innerText(),/4.98 哈夫币/);
   await page.clock.runFor(61000);assert(await page.evaluate(()=>__game.events.filter(e=>e.type==='news').length===2),JSON.stringify(await page.evaluate(()=>({ticks:__game.ticks,status:__game.status,events:__game.events,feedback:document.getElementById('feedbackText').textContent})))+' errors: '+errors.join('; '));
   const appearance=await page.evaluate(()=>{
    const style=getComputedStyle(document.documentElement),up=style.getPropertyValue('--up').trim(),down=style.getPropertyValue('--down').trim();
    return {up,down,accent:style.getPropertyValue('--accent').trim(),candles:[...document.querySelectorAll('#chart g[data-index]>rect[fill^="var(--"]')].map(e=>e.getAttribute('fill')),emblem:[...document.querySelectorAll('.faction-emblem')].every(e=>e.complete&&e.naturalWidth>0)};
   });
   assert.equal(appearance.up,'#0ff796');assert.equal(appearance.down,'#ff858b');assert.equal(appearance.accent,'#941c32');assert(appearance.emblem);assert(appearance.candles.length>0);assert(appearance.candles.every(c=>c==='var(--up)'||c==='var(--down)'));
   pass(label+' — packaged Guard emblem, charcoal background and crimson UI, green gains and red losses');
   await layout(page,label);await mapAlignment(page,label);
   await page.evaluate(()=>scrollTo(0,0));await capture(page,{path:path.join(output,label+'-playing.png'),fullPage:true});
   // Clicking the actual rendered news marker opens the corresponding news.
   const news=await page.evaluate(()=>__game.events.filter(e=>e.type==='news').at(-1));
   await selectStock(page,news.index);
   const marker=page.locator('#chart g[data-index="'+news.candle+'"]').filter({has:page.locator('text', {hasText:'!'})});
   await marker.click();assert((await page.locator('#readerContent').innerText()).includes(news.title));assert(await page.locator('#newsReader').isVisible());
   const ticks=await page.evaluate(()=>__game.ticks);await page.clock.runFor(1000);assert.equal(await page.evaluate(()=>__game.ticks),ticks+1);assert.match(await page.locator('#connectionState').innerText(),/回看/);
   await page.locator('#readerClose').click();await selectStock(page,0);await page.locator('#chart').focus();await page.keyboard.press('Home');assert.match(await page.locator('#candleTime').innerText(),/第1天/);await page.locator('#inspectButton').click();assert.match(await page.locator('#readerContent').innerText(),/手续费 4.98 哈夫币/);await page.locator('#readerClose').click();
   await page.locator('#pauseButton').click();const pausedTicks=await page.evaluate(()=>__game.ticks);await page.clock.runFor(2000);assert.equal(await page.evaluate(()=>__game.ticks),pausedTicks);assert(await page.locator('#buyButton').isDisabled());
   await page.locator('#range3').click();await page.locator('#liveButton').click();assert(await page.locator('#chartCover').isHidden());
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
    assert.equal(await page.evaluate(()=>Object.keys(localStorage).join(',')),'asara.best.v1');assert.equal(await page.locator('#resultStocks .result-row').count(),6);assert.match(await page.locator('#endTrading').innerText(),/哈夫币/);await capture(page,{path:path.join(output,'result.png'),fullPage:true});
    await page.locator('#restartButton').click();assert.equal(await page.evaluate(()=>__game.ticks),0);assert.equal(await page.evaluate(()=>__intervals),1);assert.equal(await page.locator('#cashValue').innerText(),'10,000');assert.equal(await page.locator('#mapMarker').getAttribute('visibility'),await page.evaluate(()=>__game.news.location?'visible':'hidden'));assert(await page.locator('#workSummary').isHidden());
    const wage=await page.evaluate(()=>__game.workOffer.wage);assert((await page.locator('#workHelp').innerText()).includes((wage/100).toLocaleString('zh-CN')));await page.locator('#workButton').click();await page.locator('#workButton').evaluate(e=>e.click());assert.equal(await page.evaluate(()=>__game.ticks),10);assert.equal(await page.evaluate(()=>__game.wages),wage);
    pass('desktop — full 30-day timer, result, best-score storage, restart and work double-click protection');
    await page.clock.runFor(5000);await page.locator('#workButton').click();assert.match(await page.locator('#workSummary').innerText(),/期间持仓 .*收到 1 条广播/);
    await layout(page,'desktop after work');await page.locator('#receiptButton').click();assert.match(await page.locator('#readerContent').innerText(),/期间持仓/);await capture(page,{path:path.join(output,'work-report.png'),fullPage:true});await page.locator('#readerClose').click();pass('desktop — half-day job report separates wages, holdings and intervening news');
   }
   // Reading history must not resize the main layout or move trading controls.
   await page.evaluate(()=>{__game.chain={id:'blockade',step:1};__game.makeNews();});await selectStock(page,1);
   const before=await page.locator('.trade-panel').evaluate(e=>({top:e.getBoundingClientRect().top+scrollY,height:e.getBoundingClientRect().height,width:e.getBoundingClientRect().width}));await (await newsControl(page)).click();
   assert.match(await page.locator('#readerContent').innerText(),/截获通讯.*未核实/);assert.match(await page.locator('#readerContent').innerText(),/设施风险上升/);
   assert.equal(await page.locator('#readerContent article').count(),1);assert.deepEqual(await page.locator('.trade-panel').evaluate(e=>({top:e.getBoundingClientRect().top+scrollY,height:e.getBoundingClientRect().height,width:e.getBoundingClientRect().width})),before);
   await capture(page,{path:path.join(output,label+'-broadcasts.png'),fullPage:true});await page.locator('#readerClose').click();
   await layout(page,label+' after reading broadcasts');
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
  const offline=await browser.newContext({offline:true});const file=await offline.newPage();file.on('pageerror',e=>errors.push('offline: '+e.message));await instrument(file,true);
  limitations.push('Direct file:// navigation is blocked by managed browser policy in this environment; tested network-off play after local HTTP asset load.');
  await offline.setOffline(false);await file.goto(base);await file.evaluate(()=>Promise.all([...document.images].map(img=>img.decode())));await offline.setOffline(true);
  await file.locator('#startButton').click();const offlineWage=await file.evaluate(()=>__game.workOffer.wage);await file.locator('#workButton').click();assert.equal(await file.evaluate(()=>__game.cash),1000000+offlineWage);
  assert(await file.locator('.coin img').first().evaluate(e=>e.complete&&e.naturalWidth===401));
  await file.evaluate(()=>{__game.cash=AsaraGame.TARGET;});await file.clock.runFor(1000);assert(await file.locator('#endOverlay').isVisible());assert.match(await file.locator('#recordNote').innerText(),/禁止本地存储/);await file.locator('#restartButton').click();assert.equal(await file.evaluate(()=>__intervals),1);await offline.close();
  pass('network-off gameplay after asset load — original assets, immediate win and blocked storage');
  assert.deepEqual(errors,[]);pass('all browser scenarios — no uncaught JavaScript errors');
  fs.writeFileSync(path.join(output,'browser-results.json'),JSON.stringify({browser:await browser.version(),checks,results,errors,limitations,nativeZoom:{screen:[1366,768],cssViewport:[683,384],devicePixelRatio:2},note:'Chromium desktop rendering with mobile viewport/touch emulation; not physical iOS/Android testing.'},null,2)+'\n');
  console.log('\n'+checks+' real-browser checks passed.');
 }finally{await zoomContext?.close();await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
