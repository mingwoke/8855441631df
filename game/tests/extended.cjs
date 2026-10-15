// Two additional seeded browser sessions and regressions discovered during review.
// Uses an accelerated browser clock. Only state observation is injected into dist.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'verification');
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'dist','.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(path.join(root,'dist')+path.sep)){res.writeHead(403).end();return;}
 fs.readFile(file,(e,b)=>{if(e){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.css':'text/css','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(b);});
});
const results=[],rounds=[],errors=[];let axisSamples=0;
const pass=name=>{results.push(name);console.log('PASS '+name);};
async function open(browser,base,width,height,initialSeed,denyStorage=false){
 const context=await browser.newContext({viewport:{width,height},isMobile:width<500,hasTouch:width<500});const page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));await page.clock.install({time:new Date('2026-10-16T00:00:00Z')});await page.clock.pauseAt(new Date('2026-10-16T00:00:01Z'));
 await page.addInitScript(({initialSeed,denyStorage})=>{
  let seed=initialSeed,api;const rng=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
  Object.defineProperty(window,'AsaraGame',{configurable:true,get(){return api;},set(v){const Base=v.Game;v.Game=class extends Base{constructor(){super(rng);window.__game=this;}};api=v;}});
  window.__intervals=0;const old=window.setInterval;window.setInterval=(...args)=>{window.__intervals++;return old(...args);};
  if(denyStorage)Object.defineProperty(window,'localStorage',{get(){throw new Error('Storage disabled by test');}});
 },{initialSeed,denyStorage});
 await page.goto(base);await page.locator('#startButton').click();return {page,context};
}
async function accounting(page){
 const a=await page.evaluate(()=>({cash:__game.cash,total:__game.total,wages:__game.wages,net:__game.tradingPnl,stocks:__game.stocks.map(s=>({shares:s.shares,cost:s.cost,price:s.price,realized:s.realized})),display:document.getElementById('totalValue').textContent}));
 assert(a.cash>=0&&Number.isSafeInteger(a.cash));assert.equal(a.total,a.cash+a.stocks.reduce((n,s)=>n+s.shares*s.price,0));
 assert.equal(a.total,1000000+a.wages+a.net);assert.equal(a.net,a.stocks.reduce((n,s)=>n+s.realized+s.shares*s.price-s.cost,0));
 assert.equal(a.display,Math.floor(a.total/100).toLocaleString('zh-CN'));for(const s of a.stocks)assert(s.shares>=0&&Number.isInteger(s.shares)&&s.cost>=0);
}
async function dates(page){
 const labels=await page.locator('#chart text').evaluateAll(els=>els.filter(e=>/^第\d+天$/.test(e.textContent)).map(e=>({label:e.textContent,left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right})));
 assert(labels.length>0);for(let i=1;i<labels.length;i++)assert(labels[i].left>=labels[i-1].right+2,JSON.stringify(labels));axisSamples++;
}
async function trade(page,stock,side,fraction,doubleClick=false){
 await page.locator('#stock'+stock).click();await page.locator(fraction===1?'#allButton':'#halfButton').click();const button=page.locator('#'+side+'Button');
 if(await button.isEnabled()){
  const before=await page.evaluate(()=>__game.trades);await button.click();if(doubleClick)await button.evaluate(e=>e.click());assert.equal(await page.evaluate(()=>__game.trades),before+1);await accounting(page);await page.clock.runFor(400);
 }
}
async function job(page){
 if(await page.locator('#workButton').isEnabled()){
  const before=await page.evaluate(()=>({cash:__game.cash,wage:__game.workOffer.wage,ticks:__game.ticks}));
  assert((await page.locator('#workHelp').innerText()).includes((before.wage/100).toLocaleString('zh-CN')));await page.locator('#workButton').click();
  assert.equal(await page.evaluate(()=>__game.cash),before.cash+before.wage);assert.equal(await page.evaluate(()=>__game.ticks),before.ticks+10);await accounting(page);
 }
}
async function settlement(page,label,seed){
 assert.equal(await page.evaluate(()=>__game.ticks),600);assert(await page.locator('#endOverlay').isVisible());await accounting(page);
 const r=await page.evaluate(()=>({ticks:__game.ticks,assets:__game.total/100,wages:__game.wages/100,fees:__game.fees/100,tradingPnl:__game.tradingPnl/100,trades:__game.trades,jobs:__game.workCount,news:__game.events.filter(e=>e.type==='news').length}));
 rounds.push({label,seed,...r});assert(r.trades>10&&r.jobs>0&&r.news===15);await page.screenshot({path:path.join(out,label+'-result.png'),fullPage:true});
}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const one=await open(browser,base,1024,768,735),p=one.page;
  await p.keyboard.down('Escape');assert.equal(await p.evaluate(()=>__game.status),'paused');await p.keyboard.down('Escape');await p.keyboard.down('Escape');await p.keyboard.up('Escape');
  await p.clock.runFor(10000);assert.equal(await p.evaluate(()=>__game.status),'paused');assert.equal(await p.evaluate(()=>__game.ticks),0);await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>__game.status),'running');
  pass('round 1 — holding Escape pauses once; only a fresh key press resumes');
  await trade(p,0,'buy',.5);await p.clock.runFor(21000);await p.locator('#newsArchive>summary').click();const old=p.locator('#newsHistory details').first(),tick=await old.getAttribute('data-news-tick');await old.locator('summary').click();
  await p.clock.runFor(40000);const kept=p.locator('#newsHistory details[data-news-tick="'+tick+'"]');assert(await kept.evaluate(e=>e.open));assert(await kept.locator('summary').evaluate(e=>e===document.activeElement));
  await p.clock.runFor(40000);assert(await kept.evaluate(e=>e.open));await p.clock.runFor(40000);assert.equal(await kept.count(),0);assert(await p.locator('#newsArchive>summary').evaluate(e=>e===document.activeElement));
  pass('round 1 — new broadcasts preserve expanded reading and focus; expired entries return focus to archive');
  let iteration=0,zoomOut=true;
  while(await p.evaluate(()=>__game.status==='running')){
   await trade(p,iteration%3,iteration%3===2?'sell':'buy',iteration%2?1:.5,true);
   if(iteration%4===2&&await p.evaluate(()=>__game.remaining>=10))await job(p);
   if(await p.evaluate(()=>__game.status!=='running'))break;
   if(await p.locator(zoomOut?'#zoomOut':'#zoomIn').isDisabled())zoomOut=!zoomOut;
   await p.locator(zoomOut?'#zoomOut':'#zoomIn').click();await dates(p);
   if(iteration%5===0){await p.locator('#historyRange').focus();await p.keyboard.press('Home');const t=await p.evaluate(()=>__game.ticks);await p.clock.runFor(1000);assert.equal(await p.evaluate(()=>__game.ticks),t+1);assert.equal(await p.locator('#historyRange').inputValue(),'0');await dates(p);await p.locator('#liveButton').click();}
   if(iteration===12){await p.evaluate(()=>scrollTo(0,0));await p.screenshot({path:path.join(out,'extended-round1-playing.png'),fullPage:true});}
   await p.clock.runFor(8000);await accounting(p);iteration++;assert(iteration<90);
  }
  await settlement(p,'extended-round1',735);pass('round 1 — 30 days of frequent trading, click protection, jobs, history and changing zoom reconcile');await one.context.close();

  const two=await open(browser,base,360,740,9481,true),m=two.page;
  await trade(m,0,'buy',1);assert(await m.locator('#buyButton').isDisabled());assert(await m.locator('#workButton').isEnabled());await job(m);
  const before=await m.evaluate(()=>JSON.stringify({ticks:__game.ticks,cash:__game.cash,prices:__game.stocks.map(s=>s.price)}));
  await m.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')));await m.clock.runFor(60000);await m.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow')));
  assert.equal(await m.evaluate(()=>__game.status),'paused');assert.equal(await m.evaluate(()=>JSON.stringify({ticks:__game.ticks,cash:__game.cash,prices:__game.stocks.map(s=>s.price)})),before);
  for(const id of ['buyButton','sellButton','workButton'])assert(await m.locator('#'+id).isDisabled());await m.locator('#pauseButton').click();
  pass('round 2 — simulated pagehide freezes balances/time and pageshow requires manual resume');
  while(await m.evaluate(()=>__game.stocks[0].shares>1))await trade(m,0,'sell',.5);
  assert.equal(await m.evaluate(()=>__game.stocks[0].shares),1);assert(await m.locator('#sellButton').isDisabled());await trade(m,0,'sell',1);assert.equal(await m.evaluate(()=>__game.stocks[0].cost),0);
  pass('round 2 — full-cash purchase leaves insufficient funds; work recovers cash and last share requires full sale');
  iteration=0;let scanned=false;
  while(await m.evaluate(()=>__game.remaining>12)){
   await trade(m,iteration%3,iteration%3===2?'sell':'buy',iteration%2?1:.5);
   if(iteration%3===1&&await m.evaluate(()=>__game.remaining>22))await job(m);
   while(await m.locator('#zoomOut').isEnabled())await m.locator('#zoomOut').click();
   if(iteration===6){await m.setViewportSize({width:740,height:360});await m.locator('#stock1').click();assert(await m.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await dates(m);await m.setViewportSize({width:360,height:740});await m.locator('#stock1').click();}
   if(!scanned&&await m.evaluate(()=>__game.ticks>=240)){
    for(let i=0;i<18;i++){await m.clock.runFor(5000);await dates(m);}scanned=true;await m.evaluate(()=>scrollTo(0,0));await m.screenshot({path:path.join(out,'extended-round2-dates.png'),fullPage:true});
   }
   await dates(m);const remaining=await m.evaluate(()=>__game.remaining);await m.clock.runFor(Math.min(11000,Math.max(0,(remaining-11)*1000)));await accounting(m);iteration++;assert(iteration<70);
  }
  assert(scanned);pass('round 2 — portrait/landscape and rolling maximum-range chart dates remain legible');
  await m.clock.runFor((await m.evaluate(()=>__game.remaining)-1)*1000);assert.equal(await m.evaluate(()=>__game.ticks),599);assert(await m.locator('#workButton').isDisabled());
  await m.clock.runFor(1000);await settlement(m,'extended-round2',9481);assert.match(await m.locator('#recordNote').innerText(),/禁止本地存储/);
  pass('round 2 — final second blocks work, ends exactly on day 30 and settles with storage disabled');
  const best=await m.locator('#endBest').innerText();await m.locator('#restartButton').click();await m.clock.runFor(1000);assert.equal(await m.evaluate(()=>__game.ticks),1);await m.clock.runFor(599000);
  assert(await m.locator('#endOverlay').isVisible());assert.equal(await m.locator('#endBest').innerText(),best);await m.locator('#restartButton').click();await m.clock.runFor(1000);
  assert.equal(await m.evaluate(()=>__game.ticks),1);assert.equal(await m.evaluate(()=>__intervals),1);assert.equal(await m.evaluate(()=>__game.events.length),0);assert.equal(await m.locator('#cashValue').innerText(),'10,000');
  pass('round 2 — two consecutive restarts retain only in-memory best score and a single timer');await two.context.close();
  assert.deepEqual(errors,[]);pass('both rounds — no uncaught JavaScript errors');
  fs.writeFileSync(path.join(out,'extended-results.json'),JSON.stringify({date:new Date().toISOString(),browser:await browser.version(),checks:results.length,results,rounds,axisSamples,errors,note:'Accelerated browser clock; mobile viewport/touch emulation. pagehide/pageshow are dispatched browser events, not physical-device background tests. An additional idle 30-day session verifies consecutive restart.'},null,2)+'\n');
  console.log('\n'+results.length+' extended browser checks passed; '+axisSamples+' date-axis samples.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
