// Complete mixed-action sessions in real Chromium, with an accelerated browser clock.
// Test-only observation hooks never ship in dist. No future prices inform actions.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'verification');
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 const file=path.resolve(root,'dist','.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(path.join(root,'dist')+path.sep)){res.writeHead(403).end();return;}
 fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.css':'text/css','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(data);});
});
const results=[],sessions=[],errors=[];
const pass=name=>{results.push(name);console.log('PASS '+name);};
async function setup(browser,base,width,height){
 const context=await browser.newContext({viewport:{width,height},isMobile:width<500,hasTouch:width<500});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install({time:new Date('2026-10-15T12:00:00Z')});await page.clock.pauseAt(new Date('2026-10-15T12:00:01Z'));
 await page.addInitScript(()=>{
  let seed=1229,api;const rng=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
  Object.defineProperty(window,'AsaraGame',{configurable:true,get(){return api;},set(v){const Base=v.Game;v.Game=class extends Base{constructor(){super(rng);window.__game=this;}};api=v;}});
  window.__intervals=0;const original=window.setInterval;window.setInterval=(...args)=>{window.__intervals++;return original(...args);};
 });
 await page.goto(base);return {page,context};
}
async function moneyInvariant(page){
 const s=await page.evaluate(()=>({cash:__game.cash,total:__game.total,wages:__game.wages,net:__game.tradingPnl,positions:__game.stocks.map(s=>({shares:s.shares,price:s.price,cost:s.cost,realized:s.realized})),visible:document.getElementById('totalValue').textContent}));
 assert.equal(s.total,s.cash+s.positions.reduce((a,p)=>a+p.shares*p.price,0));
 assert.equal(s.total,1000000+s.wages+s.net);
 assert.equal(s.net,s.positions.reduce((a,p)=>a+p.realized+p.shares*p.price-p.cost,0));
 assert.equal(s.visible,Math.floor(s.total/100).toLocaleString('zh-CN'));assert(s.cash>=0);
}
async function selectStock(page,index){if(await page.locator('#stockSelect').isVisible())await page.locator('#stockSelect').selectOption(String(index));else await page.locator('#stock'+index).click();}
async function newsControl(page){return await page.locator('#newsArchive').isVisible()?page.locator('#newsArchive'):page.locator('#newsTicker');}
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  for(const [label,width,height] of [['desktop',1366,768],['mobile',390,844]]){
   const {page,context}=await setup(browser,base,width,height);
   await page.locator('#startButton').focus();await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'startButton');await page.keyboard.press('Shift+Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'startButton');
   assert.equal(await page.locator('.cover-lore,#loreSummary').count(),0);assert(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1));
   await page.locator('#startButton').click();assert.equal(await page.evaluate(()=>scrollY),0);
   pass(label+' — archive removed, keyboard focus stays on start, intro and game need no scrolling');
   let iteration=0,quotedTotal=0;
   while(await page.evaluate(()=>__game.status==='running')){
    const stock=iteration%6;await selectStock(page,stock);
    await page.locator(iteration%2?'#allButton':'#halfButton').click();
    const action=iteration%4===3?'sell':'buy';if(await page.locator('#'+action+'Button').isEnabled())await page.locator('#'+action+'Button').click();
    await moneyInvariant(page);
    if(iteration%3===1&&await page.locator('#workButton').isEnabled()){
     const wage=await page.evaluate(()=>__game.workOffer.wage),cash=await page.evaluate(()=>__game.cash);
     assert((await page.locator('#workHelp').innerText()).includes((wage/100).toLocaleString('zh-CN')));
     await page.locator('#workButton').click();quotedTotal+=wage;assert.equal(await page.evaluate(()=>__game.cash),cash+wage);await moneyInvariant(page);
    }
    if(iteration===4){
     await page.locator('#pauseButton').click();const before=await page.evaluate(()=>JSON.stringify({t:__game.ticks,cash:__game.cash,prices:__game.stocks.map(s=>s.price)}));
     for(const id of ['buyButton','sellButton','workButton'])assert(await page.locator('#'+id).isDisabled());
     await page.locator('#chart').focus();await page.keyboard.press('Home');await page.locator('#range7').click();await page.clock.runFor(5000);
     assert.equal(await page.evaluate(()=>JSON.stringify({t:__game.ticks,cash:__game.cash,prices:__game.stocks.map(s=>s.price)})),before);
     await page.locator('#pauseButton').click();const tick=await page.evaluate(()=>__game.ticks);await page.clock.runFor(1000);assert.equal(await page.evaluate(()=>__game.ticks),tick+1);assert.match(await page.locator('#connectionState').innerText(),/回看/);await page.locator('#liveButton').click();
    }
    if(iteration===5){
     await page.locator(await page.locator('#mapToggle').isVisible()?'#mapToggle':'#siteDetails').click();assert(await page.locator('#readerMap').isVisible());await page.locator('#readerClose').click();
     await (await newsControl(page)).click();assert((await page.locator('#readerContent').innerText()).length>30);await page.locator('#readerClose').click();
    }
    assert(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1&&document.documentElement.scrollWidth<=innerWidth+1),'main layout must still fit after trading and work');
    if(iteration===12){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(out,label+'-mid-session.png'),fullPage:true});}
    await page.clock.runFor(20000);await moneyInvariant(page);iteration++;assert(iteration<35);
   }
   assert.equal(await page.evaluate(()=>__game.ticks),600);assert(await page.locator('#endOverlay').isVisible());
   const summary=await page.evaluate(()=>({ticks:__game.ticks,assets:__game.total/100,trades:__game.trades,jobs:__game.workCount,wages:__game.wages,news:__game.events.filter(e=>e.type==='news').length}));
   assert(summary.trades>=10&&summary.jobs>=5&&summary.news>=10);assert.equal(summary.wages,quotedTotal);sessions.push({label,...summary});
   assert.equal(await page.locator('#endAssets').innerText(),Math.floor(summary.assets).toLocaleString('zh-CN'));
   await page.screenshot({path:path.join(out,label+'-mixed-result.png'),fullPage:true});
   pass(label+' — full 30-day mixed trades/jobs/news session, exact accounting, pause and live history');
   await page.locator('#restartButton').click();
   assert.equal(await page.evaluate(()=>scrollY),0);assert(await page.locator('#newsReader').isHidden());
   assert.equal(await page.locator('#mapToggle').getAttribute('aria-expanded'),'false');assert.equal(await page.evaluate(()=>__intervals),1);assert.equal(await page.locator('#cashValue').innerText(),'10,000');assert.equal(await page.evaluate(()=>__game.events.length),0);
   assert(await page.locator('#workSummary').isHidden());assert(await page.locator('#candleInspector').isHidden());assert.equal(await page.locator('#range3').getAttribute('aria-pressed'),'true');
   assert.equal(await page.evaluate(()=>Object.keys(localStorage).join(',')),'asara.best.v1');
   pass(label+' — restart resets scroll, expanded details, chart, trades, wages and time without new timers');
   await context.close();
  }
  const {page,context}=await setup(browser,base,375,667);await page.locator('#startButton').click();
  await page.evaluate(()=>{__game.cash=2001;});await page.clock.runFor(1000);assert(await page.locator('#buyButton').isDisabled());assert(await page.locator('#sellButton').isDisabled());assert(await page.locator('#workButton').isEnabled());
  const wage=await page.evaluate(()=>__game.workOffer.wage);await page.locator('#workButton').click();assert.equal(await page.evaluate(()=>__game.cash),2001+wage);assert(await page.locator('#buyButton').isEnabled());
  pass('low funds — fees block unaffordable buys, empty holdings block sells and quoted work restores cash');
  await page.evaluate(()=>{__game.cash=99999999;});await page.clock.runFor(1000);await page.evaluate(()=>scrollTo(0,0));
  for(const width of [320,375,390]){
   await page.setViewportSize({width,height:667});
   const layout=await page.evaluate(()=>{const nodes=[...document.querySelector('.topbar').children],rects=nodes.map(e=>e.getBoundingClientRect());return {overflow:document.documentElement.scrollWidth>innerWidth,overlap:rects.some((a,i)=>rects.some((b,j)=>j>i&&a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top)),clipped:nodes.some(e=>e.scrollWidth>e.clientWidth+1)};});
   assert.deepEqual(layout,{overflow:false,overlap:false,clipped:false},width+'px near target');
   if(width===375)await page.screenshot({path:path.join(out,'mobile-near-target.png'),fullPage:true});
   pass(width+'px near-target balance — full asset figures, cash and pause stay separate and unclipped');
  }
  await context.close();assert.deepEqual(errors,[]);pass('all complete-session scenarios — no uncaught JavaScript errors');
  const report={date:new Date().toISOString(),browser:await browser.version(),checks:results.length,results,sessions,errors,note:'Real Chromium with an accelerated clock; mobile viewport/touch emulation, not physical-device or ten-minute wall-clock testing.'};
  fs.writeFileSync(path.join(out,'playthrough-results.json'),JSON.stringify(report,null,2)+'\n');console.log('\n'+results.length+' complete-session browser checks passed.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
