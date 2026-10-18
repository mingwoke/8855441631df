// Actual Chromium interactions for six stocks, proportional/custom orders and one-screen operation.
// Injected state is used only for deterministic observation and explicit edge cases.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'verification'),results=[],errors=[];
const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname,f=path.resolve(root,'dist','.'+(pathname==='/'?'/index.html':pathname));if(!f.startsWith(path.join(root,'dist')+path.sep)){res.writeHead(403).end();return;}fs.readFile(f,(err,b)=>{if(err){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.css':'text/css','.png':'image/png'})[path.extname(f)]||'application/octet-stream');res.end(b);});});
const pass=n=>{results.push(n);console.log('PASS '+n);};
async function stock(p,i){if(await p.locator('#stockSelect').isVisible())await p.locator('#stockSelect').selectOption(String(i));else await p.locator('#stock'+i).click();}
async function fit(p,label){
 const faults=await p.evaluate(()=>{
  const faults=[];if(document.documentElement.scrollHeight>innerHeight+1)faults.push('page scrolls vertically');if(document.documentElement.scrollWidth>innerWidth+1)faults.push('page scrolls horizontally');
  for(const s of ['#buyButton','#sellButton','#workButton','.wallet','#pauseButton','.chart-bottom','.screen-footer']){const e=document.querySelector(s),r=e.getBoundingClientRect();if(r.top<0||r.bottom>innerHeight+1||r.left<0||r.right>innerWidth+1)faults.push(s+' outside screen');if(e.scrollWidth>e.clientWidth+2)faults.push(s+' content overflow');}
  for(const s of ['#shareValue','#averageValue','#positionPnl','#totalValue','#cashValue']){const e=document.querySelector(s),r=e.getBoundingClientRect(),p=e.closest('.wallet-item,.balance').getBoundingClientRect();if(r.right>p.right+1||r.left<p.left-1)faults.push(s+' numeric overlap');}
  return faults;
 });assert.deepEqual(faults,[],label);
}
async function quantity(p,n){await p.locator('#customButton').click();await p.locator('#quantityInput').fill(String(n));await p.locator('#applyQuantity').click();}
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});try{
 for(const [label,width,height] of [['desktop',1366,768],['compact-desktop',1024,600],['phone',390,844],['small-phone',320,568],['landscape',740,360],['short-window',683,384]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:width<500,hasTouch:width<500}),p=await context.newPage();p.on('pageerror',e=>errors.push(label+': '+e.message));
  await p.clock.install({time:new Date('2026-10-18T00:00:00Z')});await p.clock.pauseAt(new Date('2026-10-18T00:00:01Z'));
  await p.addInitScript(()=>{let api,seed=1017;Object.defineProperty(window,'AsaraGame',{get(){return api;},set(v){const Base=v.Game;v.Game=class extends Base{constructor(){super(()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;});window.__game=this;}};api=v;}});});
  await p.goto(base);assert.equal(await p.locator('#loreSummary,.cover-lore').count(),0);assert(await p.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1));await p.locator('#startButton').click();
  await p.locator('#quarterButton').click();const q=await p.evaluate(()=>__game.maxBuy(0,.25));await p.locator('#buyButton').click();assert.equal(await p.evaluate(()=>__game.stocks[0].shares),q);await p.clock.runFor(400);await p.locator('#threeQuarterButton').click();await p.locator('#sellButton').click();assert.equal(await p.evaluate(()=>__game.stocks[0].shares),q-Math.floor(q*.75));await p.clock.runFor(400);await p.locator('#allButton').click();await p.locator('#sellButton').click();await p.clock.runFor(400);await fit(p,label+' fractions');
  pass(label+' — quarter and three-quarter quantities are correct; all core controls remain on screen');
  await p.locator('#customButton').click();const trades=await p.evaluate(()=>__game.trades);
  for(const bad of ['0','-2','1.5','abc']){await p.locator('#quantityInput').fill(bad);await p.locator('#applyQuantity').click();assert.match(await p.locator('#quantityError').innerText(),/整数/);assert.equal(await p.evaluate(()=>__game.trades),trades);}
  await p.locator('#quantityInput').fill('7');await p.locator('#applyQuantity').click();assert(await p.locator('#newsReader').isHidden());assert.equal(await p.evaluate(()=>__game.trades),trades);
  for(let i=0;i<6;i++){await stock(p,i);await p.locator('#buyButton').click();assert.equal(await p.evaluate(i=>__game.stocks[i].shares,i),7);await p.clock.runFor(400);await fit(p,label+' stock '+i);}
  await p.locator('#portfolioButton').click();assert.equal(await p.locator('.holding-row').count(),6);assert.match(await p.locator('#readerContent').innerText(),/大坝运输.*阿萨拉能源.*绿洲通信/s);assert.match(await p.locator('#readerContent').innerText(),/浮盈亏尚未扣卖出费用/);await p.locator('#readerClose').click();
  await quantity(p,8);assert(await p.locator('#sellButton').isDisabled());await quantity(p,9999999999);assert(await p.locator('#buyButton').isDisabled());assert(await p.locator('#sellButton').isDisabled());await p.locator('#halfButton').click();assert.equal(await p.locator('#customButton').getAttribute('aria-pressed'),'false');await fit(p,label+' rejected custom order');
  pass(label+' — custom quantities validate without trading; all six stocks trade, and excess orders disable safely');
  // Exercise every authored event in both outcome branches; no message can resize the main screen.
  const groups=await p.evaluate(()=>AsaraGame.CHAINS.map(c=>({id:c.id,stages:c.stages.length})));
  for(const c of groups)for(let step=0;step<c.stages;step++)for(const n of [.01,.99]){
   await p.evaluate(({id,step,n})=>{const rng=__game.random;__game.random=()=>n;__game.chain={id,step};__game.ticks++;__game.makeNews();__game.random=rng;document.getElementById('stock5').click();},{id:c.id,step,n});assert.equal(await p.locator('#newsHeading').textContent(),await p.evaluate(()=>__game.news.heading));await fit(p,label+' '+c.id+' stage '+step);
  }
  // Explicit high-value edge state, below target, used to check large numeric labels.
  await p.evaluate(()=>{__game.cash=50000000;const s=__game.stocks[5];s.shares=3500;s.cost=100000;document.getElementById('stock5').click();});await fit(p,label+' large balances');
  await p.locator('#workButton').click();await fit(p,label+' work receipt');await p.locator('#receiptButton').click();assert.match(await p.locator('#readerContent').innerText(),/期间持仓/);await p.locator('#readerClose').click();
  await p.locator('#pauseButton').click();assert(await p.locator('#customButton').isDisabled());assert(await p.locator('#quarterButton').isDisabled());await p.locator('#rangeAll').click();await fit(p,label+' paused');await p.screenshot({path:path.join(out,'one-screen-'+label+'.png'),fullPage:true});await p.locator('#pauseButton').click();
  pass(label+' — all event branches, large balances, work and pause preserve one-screen layout');
  await p.locator('#customButton').click();await p.evaluate(()=>{__game.cash=AsaraGame.TARGET;});await p.clock.runFor(1000);assert(await p.locator('#newsReader').isHidden());assert(await p.locator('#endOverlay').isVisible());await p.locator('#restartButton').click();assert.equal(await p.locator('#halfButton').getAttribute('aria-pressed'),'true');assert.equal(await p.locator('#customButton').getAttribute('aria-pressed'),'false');assert.equal(await p.evaluate(()=>__game.stocks.length),6);assert(await p.evaluate(()=>__game.stocks.every(s=>s.shares===0)));await fit(p,label+' restart');
  pass(label+' — winning closes quantity entry; restart clears all six holdings and custom size');await context.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'orders-results.json'),JSON.stringify({date:new Date().toISOString(),browser:await browser.version(),checks:results.length,results,errors,note:'Actual Chromium, accelerated clock and mobile viewport emulation. Large-balance state injected for layout coverage; not an achieved score or physical-phone test.'},null,2)+'\n');console.log('\n'+results.length+' order and viewport checks passed.');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
