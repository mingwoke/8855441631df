// Readability and interaction regressions from the user's screenshots.
// Real Chromium; CDP touch events emulate gestures, not physical-device testing.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'verification'),results=[],errors=[];
const server=http.createServer((req,res)=>{const file=path.resolve(root,'dist','.'+(req.url==='/'?'/index.html':req.url));if(!file.startsWith(path.join(root,'dist')+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(e,b)=>{if(e){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.css':'text/css','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(b);});});
const pass=n=>{results.push(n);console.log('PASS '+n);};
async function open(browser,base,width,height){
 const context=await browser.newContext({viewport:{width,height},hasTouch:width<500,isMobile:width<500});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install({time:new Date('2026-10-18T00:00:00Z')});await page.clock.pauseAt(new Date('2026-10-18T00:00:01Z'));
 await page.addInitScript(()=>{let api,seed=629;Object.defineProperty(window,'AsaraGame',{get(){return api;},set(v){const Base=v.Game;v.Game=class extends Base{constructor(){super(()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;});window.__game=this;}};api=v;}});});
 await page.goto(base);await page.locator('#startButton').click();await page.locator('#buyButton').click();await page.clock.runFor(241000);return {context,page};
}
async function documentBox(page,sel){return page.locator(sel).evaluate(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y+scrollY,width:r.width,height:r.height};});}
async function swipe(page,dx,dy){
 await page.locator('#chart').scrollIntoViewIfNeeded();const r=await page.locator('#chart').boundingBox(),x=r.x+r.width*.45,y=r.y+r.height*.55,cdp=await page.context().newCDPSession(page);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/8,y:y+dy*i/8}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
}
async function selectStock(page,index){if(await page.locator('#stockSelect').isVisible())await page.locator('#stockSelect').selectOption(String(index));else await page.locator('#stock'+index).click();}
async function newsControl(page){return await page.locator('#newsArchive').isVisible()?page.locator('#newsArchive'):page.locator('#newsTicker');}
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});try{
 for(const [label,width,height] of [['desktop',1366,768],['phone',390,844],['small-phone',320,568],['small-window',800,600]]){
  const {page:p,context}=await open(browser,base,width,height);
  const typography=await p.evaluate(()=>['.label','.wallet-label','.action b','.fraction button'].map(s=>[s,parseFloat(getComputedStyle(document.querySelector(s)).fontSize)]));
  for(const [sel,size] of typography)assert(size>=14,sel+' is too small');
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight+1));pass(label+' — primary labels at least 14px and main controls fit without scrolling');
  const tradeBefore=await documentBox(p,'.trade-panel');await p.locator(width>960?'#siteDetails':'#mapToggle').click();assert(await p.locator('#readerMap').isVisible());assert.deepEqual(await documentBox(p,'.trade-panel'),tradeBefore);await p.locator('#readerClose').click();pass(label+' — situation reading cannot stretch the main layout');
  const before=await documentBox(p,'.trade-panel');await (await newsControl(p)).click();
  assert.equal(await p.locator('#readerContent article').count(),1);assert.deepEqual(await documentBox(p,'.trade-panel'),before);
  await p.locator('#broadcastSelect').selectOption({index:2});const message=await p.locator('#readerContent').innerText(),choice=await p.locator('#broadcastSelect').inputValue();await p.locator('#broadcastSelect').focus();await p.locator('#readerPanel').evaluate(e=>{e.scrollTop=120;});const readerScroll=await p.locator('#readerPanel').evaluate(e=>e.scrollTop);
  const tick=await p.evaluate(()=>__game.ticks);await p.clock.runFor(40000);assert.equal(await p.evaluate(()=>__game.ticks),tick+40);assert.equal(await p.locator('#readerContent').innerText(),message);assert.equal(await p.locator('#broadcastSelect').inputValue(),choice);assert.equal(await p.locator('#readerPanel').evaluate(e=>e.scrollTop),readerScroll);assert(await p.locator('#broadcastSelect').evaluate(e=>e===document.activeElement));
  await p.keyboard.press('Tab');assert(await p.locator('#readerClose').evaluate(e=>e===document.activeElement));await p.keyboard.press('Shift+Tab');assert(await p.locator('#broadcastSelect').evaluate(e=>e===document.activeElement));
  await p.locator('#broadcastSelect').selectOption({index:0});assert.equal(await p.locator('#readerPanel').evaluate(e=>e.scrollTop),0);await p.screenshot({path:path.join(out,'readability-'+label+'-reader.png'),fullPage:true});await p.keyboard.press('Escape');assert(await p.locator('#newsReader').isHidden());assert.equal(await p.evaluate(()=>__game.status),'running');assert(await (await newsControl(p)).evaluate(e=>e===document.activeElement));
  pass(label+' — one-message reader leaves layout intact, keeps reading/focus on arrival, closes with Escape');
  // Old/current data are visibly separated, and historical scale does not follow the live quote.
  await p.locator('#chart').focus();await p.keyboard.press('Home');const time=await p.locator('#candleTime').innerText(),ohlc=await p.locator('#ohlc').innerText(),range=await p.locator('#chart').innerHTML();assert.match(time,/选中：第1天/);assert.equal(await p.locator('#changeValue').getAttribute('title'),'相对本游戏日开盘价');
  await p.clock.runFor(6000);assert.equal(await p.locator('#candleTime').innerText(),time);assert.equal(await p.locator('#ohlc').innerText(),ohlc);assert.equal(await p.locator('#chart').innerHTML(),range);assert.match(await p.locator('#connectionState').innerText(),/回看.*行情继续/);
  await p.locator('#inspectButton').click();assert.match(await p.locator('#readerContent').innerText(),/手续费 4.98 哈夫币/);assert(!/undefined|NaN/.test(await p.locator('#readerContent').innerText()));await p.locator('#readerClose').click();await p.locator('#liveButton').click();assert(await p.locator('#candleInspector').isHidden());assert(await p.locator('#liveButton').isHidden());
  pass(label+' — historical OHLC/date stay fixed; live quote stays labeled; trade detail shows exact fee');
  if(width<500){
   const before=await p.locator('#chart').innerHTML();await swipe(p,100,0);assert.notEqual(await p.locator('#chart').innerHTML(),before);assert.match(await p.locator('#connectionState').innerText(),/回看/);assert(await p.locator('#newsReader').isHidden());assert(await p.locator('#candleInspector').isHidden());
   await p.locator('#liveButton').click();await swipe(p,0,-90);assert(await p.locator('#liveButton').isHidden());assert(await p.locator('#newsReader').isHidden());pass(label+' — touch drag pans history without opening markers; vertical gesture preserves live view');
  }else{
   await p.locator('#chart').scrollIntoViewIfNeeded();const r=await p.locator('#chart').boundingBox();await p.mouse.move(r.x+r.width*.5,r.y+r.height*.55);await p.mouse.down();await p.mouse.move(r.x+r.width*.7,r.y+r.height*.55,{steps:8});await p.mouse.up();assert.match(await p.locator('#connectionState').innerText(),/回看/);assert(await p.locator('#newsReader').isHidden());await p.locator('#liveButton').click();pass(label+' — mouse drag pans history without accidental selection');
  }
  await p.locator('#rangeAll').click();await p.locator('#chart').focus();await p.keyboard.press('Home');await p.locator('#range3').click();assert.match(await p.locator('#candleTime').innerText(),/第1天/);await p.locator('#chart').focus();await p.keyboard.press('End');assert(await p.locator('#liveButton').isHidden());
  await p.locator('#historyPrev').click();assert.match(await p.locator('#connectionState').innerText(),/回看/);await p.locator('#historyNext').click();await p.locator('#liveButton').click();
  await p.locator('#pauseButton').click();const frozen=await p.evaluate(()=>__game.ticks);await p.locator('#range7').click();await p.locator('#historyPrev').click();await p.clock.runFor(3000);assert.equal(await p.evaluate(()=>__game.ticks),frozen);assert.match(await p.locator('#connectionState').innerText(),/回看.*暂停/);await p.locator('#liveButton').click();await p.locator('#pauseButton').click();
  pass(label+' — range presets, page arrows and keyboard work in live/paused modes');
  await p.locator('#rangeAll').click();await p.evaluate(()=>scrollTo(0,0));await p.screenshot({path:path.join(out,'readability-'+label+'-overview.png'),fullPage:true});
  // A whole-session overview has more events than pixels; clustered markers must remain clickable.
  const markerRects=await p.locator('#chart g[data-marker]').evaluateAll(els=>els.map(e=>{const r=e.querySelector('rect[fill="transparent"]').getBoundingClientRect();return {left:r.left,right:r.right};}));
  for(let i=1;i<markerRects.length;i++)assert(markerRects[i].left>=markerRects[i-1].right-2,'overlapping marker hit regions');
  for(const marker of await p.locator('#chart g[data-marker]').all()){await marker.click();assert(await p.locator('#newsReader').isVisible());assert((await p.locator('#readerContent').innerText()).length>20);await p.locator('#readerClose').click();}
  pass(label+' — overview event markers are separate click targets and open their records');
  await p.locator('#liveButton').click();await (await newsControl(p)).click();await p.clock.runFor((600-await p.evaluate(()=>__game.ticks))*1000);assert(await p.locator('#newsReader').isHidden());assert(await p.locator('#endOverlay').isVisible());await p.locator('#restartButton').click();assert(await p.locator('#newsReader').isHidden());assert(await p.locator('#candleInspector').isHidden());assert.equal(await p.locator('#range3').getAttribute('aria-pressed'),'true');assert(await p.locator('#liveButton').isHidden());assert(await p.locator('#newsArchive').isDisabled());assert.equal(await p.evaluate(()=>scrollY),0);
  pass(label+' — settlement safely closes reader; restart clears reading, history range and scroll');await context.close();
 }
 assert.deepEqual(errors,[]);pass('all usability scenarios — no uncaught JavaScript errors');fs.writeFileSync(path.join(out,'usability-results.json'),JSON.stringify({date:new Date().toISOString(),browser:await browser.version(),checks:results.length,results,errors,note:'Accelerated clock and emulated mobile/touch; not physical phone testing.'},null,2)+'\n');console.log('\n'+results.length+' usability checks passed.');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
