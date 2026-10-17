const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync(require('node:path').join(__dirname,'../dist/index.html'),'utf8');
const css=fs.readFileSync(require('node:path').join(__dirname,'../dist/styles.css'),'utf8');
const engine=html.match(/<script id="engine">([\s\S]*?)<\/script>/)[1];
const ui=html.match(/<script id="ui">([\s\S]*?)<\/script>/)[1];
new vm.Script(engine);new vm.Script(ui);
let checks=0;const test=(name,fn)=>{fn();checks++;console.log("PASS "+name);};
function seeded(n){return ()=>{n=(Math.imul(1664525,n)+1013904223)>>>0;return n/4294967296;};}
const ctx={};vm.createContext(ctx);vm.runInContext(engine,ctx);
const {Game,START,TARGET,LIMIT,WORK_TICKS,JOBS,fee}=ctx.AsaraGame;
test('fresh game, exact initial cash and empty holdings',()=>{let g=new Game();assert.equal(g.cash,1000000);assert.equal(g.total,START);assert.equal(g.day,1);assert.equal(g.status,'ready');assert(g.stocks.every(s=>s.shares===0));assert.equal(g.trade(0,'buy',1),null);});
test('half buy uses half cash including fee and full sell conserves accounting',()=>{let g=new Game();g.start();let b=g.trade(0,'buy',.5);assert.equal(b.qty,249);assert.equal(b.fee,498);assert.equal(g.cash,501502);assert.equal(g.stocks[0].cost,498498);let s=g.trade(0,'sell',1);assert.equal(s.qty,249);assert.equal(s.pnl,-996);assert.equal(g.total,START-996);assert.equal(g.fees,996);assert.equal(g.stocks[0].cost,0);});
test('all-in includes fees; partial cost basis reconciles after final sale',()=>{let g=new Game();g.start();let b=g.trade(1,'buy',1);assert.equal(b.qty,199);assert(g.cash>=0);assert.equal(g.maxBuy(1),0);let a=g.trade(1,'sell',.5),c=g.trade(1,'sell',1);assert.equal(a.qty,99);assert.equal(c.qty,100);assert.equal(g.stocks[1].shares,0);assert.equal(g.stocks[1].cost,0);assert.equal(g.total,START-g.fees);assert.equal(g.realized,-g.fees);});
test('one share cannot half-sell; invalid and empty orders are rejected',()=>{let g=new Game();g.start();g.cash=2002;assert.equal(g.trade(0,'buy',1).qty,1);assert.equal(g.trade(0,'sell',.5),null);assert.equal(g.trade(0,'sell',1).qty,1);assert.equal(g.trade(0,'sell',1),null);assert.equal(g.trade(-1,'buy',1),null);assert.equal(g.trade(0,'garbage',1),null);});
test('pause freezes money, time, prices and jobs',()=>{let g=new Game(seeded(5));g.start();g.tick();g.pause();const before=JSON.stringify({cash:g.cash,t:g.ticks,s:g.stocks});assert.equal(g.tick(),false);assert.equal(g.work(),null);assert.equal(g.trade(0,'buy',1),null);assert.equal(JSON.stringify({cash:g.cash,t:g.ticks,s:g.stocks}),before);assert(g.resume());assert(g.tick());});
test('work pays its quoted wage and simulates exactly 10 ticks',()=>{let g=new Game(seeded(8));g.start();let p=g.stocks.map(s=>s.price);const quoted=g.workOffer.wage,r=g.work();assert.equal(g.cash,START+quoted);assert.equal(g.ticks,10);assert.equal(g.day,1);assert.equal(r.elapsed,10);assert.equal(g.wages,r.wage);assert(g.stocks.some((s,i)=>s.price!==p[i]));});
test('exactly 600 seconds ends day 30; all actions remain blocked',()=>{let g=new Game(seeded(9));g.start();for(let i=0;i<599;i++)g.tick();assert.equal(g.status,'running');assert.equal(g.day,30);assert.equal(g.work(),null);g.tick();assert.equal(g.status,'ended');assert.equal(g.ticks,LIMIT);assert.equal(g.day,30);assert.equal(g.won,false);let n=g.total;assert.equal(g.tick(),false);assert.equal(g.trade(0,'buy',1),null);assert.equal(g.work(),null);assert.equal(g.total,n);});
test('60 half-day jobs reconcile all variable wages and finish cleanly',()=>{let g=new Game(seeded(11));g.start();let wages=0;for(let i=0;i<60;i++){const offer=g.workOffer.wage,r=g.work();assert.equal(r.wage,offer);wages+=offer;}assert.equal(g.cash,START+wages);assert.equal(g.wages,wages);assert.equal(g.ticks,600);assert.equal(g.status,'ended');});
test('hitting target wins immediately',()=>{let g=new Game(seeded(4));g.start();g.cash=TARGET-g.workOffer.wage;let r=g.work();assert.equal(g.status,'ended');assert(g.won);assert.equal(g.total,TARGET);assert.equal(r.elapsed,0);});
test('news appears, decays, and learning points appear only once',()=>{let g=new Game(()=>.01);g.start();g.chain={id:'blockade',step:0};for(let i=0;i<61;i++)g.tick();assert.equal(g.news.day,4);assert.equal(g.news.id,'gti-action');assert(g.stocks[2].effect>0);assert(g.stocks[0].effect<0);assert(g.seen.has('news'));g.learn('buy');g.learn('buy');assert.equal(g.tips.filter(x=>x.key==='buy').length,1);});
test('restart resets all state, tips, effects and histories',()=>{let g=new Game(seeded(91));g.start();g.trade(0,'buy',1);g.work();g.pause();g.reset();assert.equal(g.status,'ready');assert.equal(g.cash,START);assert.equal(g.ticks,0);assert.equal(g.fees,0);assert.equal(g.wages,0);assert.equal(g.seen.size,0);assert.equal(g.tips.length,0);assert(g.stocks.every(s=>s.shares===0&&s.cost===0&&s.history.length===1&&s.effect===0));});
test('100 randomized complete games preserve monetary and stock invariants',()=>{for(let seed=1;seed<=100;seed++){const rng=seeded(seed);let g=new Game(rng);g.start();while(g.status==='running'){let index=Math.floor(rng()*3),kind=rng();if(kind<.28)g.trade(index,'buy',rng()<.5?.5:1);else if(kind<.56)g.trade(index,'sell',rng()<.5?.5:1);else if(kind<.58)g.work();g.tick();assert(Number.isSafeInteger(g.cash)&&g.cash>=0);assert(Number.isSafeInteger(g.total)&&g.total>=0);for(const s of g.stocks){assert(Number.isInteger(s.price)&&s.price>0);assert(Number.isSafeInteger(s.shares)&&s.shares>=0);assert(Number.isSafeInteger(s.cost)&&s.cost>=0);if(s.shares===0)assert.equal(s.cost,0);assert(s.history.length<=100);}}}});


// Lightweight DOM/event harness; no browser rendering.
function setupUI(denyStorage=false){
 let now=0;const elements=new Map(),intervals=[],events={},windowEvents={},saved=new Map();
 class Element{
  constructor(id){this.id=id;this.textContent='';this.style={};this.children=[];this.hidden=false;this.disabled=false;this.inert=false;this.attrs={};this.handlers={};this.classList={toggle:()=>{}};this.value=0;}
  getBoundingClientRect(){return {width:360,height:200,left:0,top:0};}
  set innerHTML(v){this._html=v;parse(v);}get innerHTML(){return this._html||'';}
  setAttribute(k,v){this.attrs[k]=v;}addEventListener(k,cb){this.handlers[k]=cb;}focus(){document.activeElement=this;}
  click(){if(!this.disabled)this.handlers.click?.();}
 }
 function parse(text){for(const match of text.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)){let e=elements.get(match[1])||new Element(match[1]);e.hidden=/\shidden(?:\s|>)/.test(match[0]);e.disabled=/\sdisabled(?:\s|>)/.test(match[0]);elements.set(e.id,e);}}
 parse(html);
 const document={body:{classList:{toggle:()=>{}}},hidden:false,activeElement:null,getElementById:id=>{assert(elements.has(id),'missing DOM #'+id);return elements.get(id);},addEventListener:(n,cb)=>events[n]=cb};
 const c={document,window:{addEventListener:(n,cb)=>windowEvents[n]=cb,scrollTo:()=>{}},performance:{now:()=>now},localStorage:{getItem:k=>{if(denyStorage)throw new Error('denied');return saved.get(k)||null;},setItem:(k,v)=>{if(denyStorage)throw new Error('denied');saved.set(k,v);}},setInterval:cb=>{intervals.push(cb);return intervals.length;},console};
 vm.createContext(c);vm.runInContext(engine,c);const Base=c.AsaraGame.Game;c.AsaraGame.Game=class extends Base{constructor(){super(seeded(23));c.game=this;}};vm.runInContext(ui,c);
 return {game:c.game,inspect:index=>{elements.get('chart').handlers.keydown({key:'Home',preventDefault(){}});for(let i=0;i<index;i++)elements.get('chart').handlers.keydown({key:'ArrowRight',preventDefault(){}});},el:id=>elements.get(id),intervals,saved,document,events,advance:ms=>{now+=ms;for(const cb of intervals)cb();},visibility:hidden=>{document.hidden=hidden;events.visibilitychange();}};
}
test('simplified UI starts with half selected and all three main actions',()=>{const u=setupUI();assert.equal(u.intervals.length,1);assert(!u.el('chartCover').hidden);u.el('startButton').click();assert(u.el('chartCover').hidden);assert.equal(u.el('halfButton').attrs['aria-pressed'],'true');u.el('buyButton').click();assert.equal(u.game.stocks[0].shares,249);assert.match(u.el('feedbackText').textContent,/买入 249股/);assert.equal(u.el('feeText').textContent,'费用 4.98 哈夫币');});
test('fraction selection, full buy, half sell, full sell and double-click protection',()=>{const u=setupUI();u.el('startButton').click();u.el('allButton').click();u.el('buyButton').click();const cash=u.game.cash;assert.equal(u.game.stocks[0].shares,499);u.el('buyButton').click();assert.equal(u.game.cash,cash);u.advance(400);u.el('halfButton').click();u.el('sellButton').click();assert.equal(u.game.stocks[0].shares,250);assert.match(u.el('feedbackText').textContent,/卖出 249股/);u.advance(400);u.el('allButton').click();u.el('sellButton').click();assert.equal(u.game.stocks[0].shares,0);assert.equal(u.game.total,START-u.game.fees);assert(u.el('sellButton').disabled);});
test('switching stock updates single chart and selected-position summary',()=>{const u=setupUI();u.el('startButton').click();u.el('stock2').click();assert.equal(u.el('stock2').attrs['aria-selected'],'true');assert.equal(u.el('stock0').attrs['tabindex'],'-1');assert.equal(u.el('marketPanel').attrs['aria-labelledby'],'stock2');assert.equal(u.el('priceValue').textContent,'12.00');u.el('buyButton').click();assert(u.game.stocks[2].shares>0);assert.equal(u.game.stocks[0].shares,0);assert.match(u.el('positionLabel').textContent,/阿萨拉基建/);assert.match(u.el('chart').attrs['aria-label'],/平均成本/);assert(!u.el('costLegend').hidden);});
test('keyboard tabs change selection and focus',()=>{const u=setupUI();u.el('stock0').handlers.keydown({key:'ArrowRight',preventDefault(){}});assert.equal(u.el('stock1').attrs['aria-selected'],'true');assert.equal(u.document.activeElement.id,'stock1');u.el('stock1').handlers.keydown({key:'End',preventDefault(){}});assert.equal(u.document.activeElement.id,'stock2');});
test('paused state freezes gameplay and automatic background pause never auto-resumes',()=>{const u=setupUI();u.el('startButton').click();u.advance(1000);u.visibility(true);assert.equal(u.game.status,'paused');assert(u.el('chartCover').hidden);assert(!u.el('app').inert);assert.equal(u.el('connectionState').textContent,'已暂停 · 可回看');assert(u.el('buyButton').disabled);assert(u.el('halfButton').disabled);const t=u.game.ticks;u.advance(10000);assert.equal(u.game.ticks,t);u.visibility(false);assert.equal(u.game.status,'paused');u.el('pauseButton').click();assert.equal(u.game.status,'running');assert(u.el('chartCover').hidden);});
test('single-share half sell is disabled and all selection allows sale',()=>{const u=setupUI();u.el('startButton').click();u.game.cash=2002;u.el('allButton').click();u.el('buyButton').click();assert.equal(u.game.stocks[0].shares,1);u.el('halfButton').click();assert(u.el('sellButton').disabled);u.el('allButton').click();assert(!u.el('sellButton').disabled);});
test('work feedback, half-day advance, and click cooldown',()=>{const u=setupUI();u.el('startButton').click();const quoted=u.game.workOffer.wage;u.el('workButton').click();assert.equal(u.game.ticks,10);assert.equal(u.game.cash,START+quoted);assert.equal(u.el('workTitle').textContent,'收工 +'+(quoted/100).toLocaleString('zh-CN'));u.el('workButton').click();assert.equal(u.game.ticks,10);u.advance(700);assert(!u.el('workButton').disabled);assert.equal(u.el('workTitle').textContent,'打工');});
test('educational hint is temporary and each event appears once',()=>{const u=setupUI();u.el('startButton').click();u.el('buyButton').click();assert(!u.el('tip').hidden);assert.equal(u.el('tip').textContent,'股票代表公司的一部分所有权。');for(let i=0;i<6;i++)u.advance(1000);assert(u.el('tip').hidden);assert.equal(u.game.tips.filter(x=>x.key==='buy').length,1);});
test('30-day result and restart clear UI state without a second timer',()=>{const u=setupUI();u.el('startButton').click();for(let i=0;i<600;i++)u.advance(1000);assert(!u.el('endOverlay').hidden);assert.equal(u.saved.size,1);assert(u.el('app').inert);u.el('restartButton').click();assert(u.el('endOverlay').hidden);assert(!u.el('app').inert);assert.equal(u.game.ticks,0);assert.equal(u.el('cashValue').textContent,'10,000');assert.equal(u.el('halfButton').attrs['aria-pressed'],'true');assert(u.el('tip').hidden);assert.equal(u.intervals.length,1);u.advance(1000);assert.equal(u.game.ticks,1);});
test('blocked local storage does not stop game or results',()=>{const u=setupUI(true);u.el('startButton').click();for(let i=0;i<600;i++)u.advance(1000);assert(!u.el('endOverlay').hidden);assert.match(u.el('recordNote').textContent,/禁止本地存储/);});
test('normal flow layout has separate learning and start screen outside chart',()=>{assert.equal((html.match(/class="chart"/g)||[]).length,1);assert(css.includes('.trading-column{display:flex;'));assert(html.includes('id="newsReader"'));assert(css.includes('env(safe-area-inset-bottom)'));assert(html.indexOf('id="chartCover"')>html.indexOf('</main>'));assert(html.indexOf('id="tip"')>html.indexOf('</section>'));assert(!/<(?:script|link|img)[^>]+(?:src|href)="https?:/.test(html));});test('every candle exactly aggregates five ticks into true OHLC, continuous opens',()=>{const g=new Game(seeded(872));g.start();for(let n=0;n<120;n++){let samples=g.stocks.map(s=>[s.price]);for(let k=0;k<5;k++){g.tick();g.stocks.forEach((s,i)=>samples[i].push(s.price));}g.stocks.forEach((s,i)=>{const c=s.candles[n];assert.equal(c.o,samples[i][0]);assert.equal(c.h,Math.max(...samples[i]));assert.equal(c.l,Math.min(...samples[i]));assert.equal(c.c,samples[i][5]);assert.equal(c.n,5);assert.equal(c.t,n*5);if(n)assert.equal(c.o,s.candles[n-1].c);});}assert(g.stocks.every(s=>s.candles.length===120));});
test('current candle grows live; trade and news markers have correct boundary indices',()=>{const g=new Game(seeded(15));g.start();g.trade(0,'buy',.5);assert.equal(g.events[0].candle,0);g.tick();assert.equal(g.stocks[0].candles[0].n,1);for(let i=1;i<5;i++)g.tick();g.trade(0,'sell',.5);assert.equal(g.events.at(-1).candle,0);g.tick();g.trade(0,'buy',.5);assert.equal(g.events.at(-1).candle,1);for(let i=6;i<61;i++)g.tick();const e=g.events.find(e=>e.type==='news');assert.equal(e.tick,20);assert.equal(e.candle,4);assert.equal(e.day,2);assert(e.source);g.reset();assert.equal(g.events.length,0);assert(g.stocks.every(s=>s.candles.length===1&&s.candles[0].n===0));});
test('candle selection and live view show actual events and reset per stock and game',()=>{const u=setupUI();u.el('startButton').click();u.el('buyButton').click();for(let i=0;i<66;i++)u.advance(1000);u.el('chart').handlers.keydown({key:'Home',preventDefault(){}});assert.match(u.el('inspectText').textContent,/买入249股/);assert(!u.el('liveButton').hidden);u.advance(1000);assert.match(u.el('candleTime').textContent,/第1天/);u.el('liveButton').click();assert(u.el('liveButton').hidden);assert(u.el('candleInspector').hidden);const e=u.game.events.find(e=>e.type==='news');u.el('stock'+e.index).click();u.inspect(e.candle);assert(u.el('inspectText').textContent.includes(e.title));u.game.cash=TARGET;u.advance(1000);u.el('restartButton').click();assert.equal(u.game.events.length,0);assert(u.el('candleInspector').hidden);assert(u.el('liveButton').hidden);});
test('candle geometry remains finite for flat, extreme and out-of-range cost cases',()=>{const u=setupUI();u.el('startButton').click();for(const c of [{t:0,o:10,h:10,l:10,c:10,n:5},{t:0,o:10,h:100000000,l:10,c:100000000,n:5},{t:0,o:100000000,h:100000000,l:10,c:10,n:5}]){u.game.stocks[0].candles=[c];u.game.stocks[0].price=c.c;u.el('stock0').click();assert(!/NaN|Infinity/.test(u.el('chart').innerHTML));}u.game.stocks[0].candles=[{t:0,o:2000,h:2001,l:2000,c:2001,n:5}];u.game.stocks[0].price=2001;u.game.stocks[0].shares=1;u.game.stocks[0].cost=99999999;u.el('stock0').click();assert.match(u.el('costLegend').textContent,/图外/);assert(!u.el('chart').innerHTML.includes('id="costLine"'));});
test('positive news is not a guarantee; stocks have independent directions',()=>{let counter=false,independent=false;for(let seed=1;seed<=100;seed++){let g=new Game(seeded(seed));g.start();for(let i=0;i<61;i++){let prices=g.stocks.map(s=>s.price);g.tick();let signs=g.stocks.map((s,j)=>Math.sign(s.price-prices[j]));if(signs.includes(1)&&signs.includes(-1))independent=true;if(i===60&&g.stocks.some((s,j)=>g.news.effects[j]>0&&s.price<prices[j]))counter=true;}}assert(counter);assert(independent);});
test('no guaranteed rising stock across seeded buy-and-hold runs',()=>{for(let index=0;index<3;index++){let losses=0,wins=0;for(let seed=1;seed<=100;seed++){let g=new Game(seeded(seed));g.start();g.trade(index,'buy',1);while(g.status==='running')g.tick();if(g.total<START)losses++;if(g.won)wins++;}assert(losses>10);assert(wins<10);console.log('  stock '+index+': '+losses+' losing runs, '+wins+' target wins / 100');}});


test('range presets preserve historical selection, work while paused and reset',()=>{const u=setupUI();u.el('startButton').click();for(let i=0;i<180;i++)u.advance(1000);assert.equal(u.el('range3').attrs['aria-pressed'],'true');const before=u.el('chart').innerHTML;u.el('range7').click();assert.equal(u.el('range7').attrs['aria-pressed'],'true');assert.notEqual(u.el('chart').innerHTML,before);u.inspect(0);u.el('rangeAll').click();assert.match(u.el('candleTime').textContent,/第1天/);u.el('pauseButton').click();const tick=u.game.ticks;u.el('range3').click();u.advance(1000);assert.equal(u.game.ticks,tick);assert(u.el('chartCover').hidden);u.el('pauseButton').click();u.game.cash=TARGET;u.advance(1000);u.el('restartButton').click();assert.equal(u.el('range3').attrs['aria-pressed'],'true');});
test('knowledge tips occupy their own row and restore the legend after expiration',()=>{const u=setupUI();u.el('startButton').click();u.el('buyButton').click();assert(!u.el('tip').hidden);assert(u.el('learningDefault').hidden);for(let i=0;i<6;i++)u.advance(1000);assert(u.el('tip').hidden);assert(!u.el('learningDefault').hidden);});

test('blockade progresses through GTI action and both possible outcomes without alliances',()=>{
 for(const [random,outcome] of [[.1,'cleared'],[.9,'extended']]){
  const g=new Game(()=>random);g.start();g.chain={id:'blockade',step:0};
  for(let i=0;i<21;i++)g.tick();assert.equal(g.news.id,'blocked');assert.equal(g.news.location,'road');assert.equal(g.news.source,'卫队广播');assert.equal(g.mapState.state,'运输受阻');
  for(let i=21;i<61;i++)g.tick();assert.equal(g.news.id,'gti-action');assert(g.news.rumor);assert.match(g.news.title,/不代表双方结盟/);assert(g.stocks[0].effect<0&&g.stocks[2].effect>0);
  for(let i=61;i<101;i++)g.tick();assert.equal(g.news.id,outcome);assert.equal(g.chain,null);assert.equal(g.events.filter(e=>e.type==='news').length,3);assert.equal(g.news.stage,3);
  assert.equal(g.mapState.tick,100);assert.equal(g.news.candle,20);
 }
});
test('all authored event branches update one map site and independent stock effects',()=>{
 const {CHAINS,LOCATIONS}=ctx.AsaraGame;const observed=new Set();
 for(const chain of CHAINS){for(let step=0;step<chain.stages.length;step++)for(const r of [.01,.99]){
  const g=new Game(()=>r);g.start();g.chain={id:chain.id,step};g.makeNews();const n=g.news;observed.add(n.id);
  assert(LOCATIONS[n.location]);assert.equal(n.effects.length,3);assert.equal(n.impact.length,3);
  assert(n.source&&n.heading&&n.title&&n.state);assert.equal(g.mapState.location,n.location);
  n.effects.forEach((v,i)=>assert.equal(Math.sign(g.stocks[i].effect),Math.sign(v)));
  if(n.source==='同伴传闻'||n.source==='截获通讯')assert.equal(n.rumor,true);
  assert.equal(g.events.length,1);
 }}
 assert.equal(observed.size,31);assert.equal(CHAINS.length,12); // All branches, including rumor confirmation/rejection.
 assert(Object.values(LOCATIONS).every(p=>p.x>=80&&p.x<=1730&&p.y>=0&&p.y<=873));
 assert(!Object.values(LOCATIONS).some(p=>p.name.includes('游客中心')));
});
test('jobs run the same news, region and candle path as elapsed market time',()=>{
 const a=new Game(seeded(45)),b=new Game(seeded(45));a.start();b.start();
 for(let i=0;i<12;i++)a.work();for(let i=0;i<120;i++)b.tick();
 assert.equal(a.ticks,b.ticks);assert.equal(JSON.stringify(a.events),JSON.stringify(b.events));
 assert.equal(JSON.stringify(a.stocks),JSON.stringify(b.stocks));assert.equal(a.cash-b.cash,a.wages);assert.equal(JSON.stringify(a.regions),JSON.stringify(b.regions));
});
test('reset clears chain, history and view state and generates a fresh opening',()=>{
 const u=setupUI();u.el('startButton').click();for(let i=0;i<61;i++)u.advance(1000);
 assert.equal(u.el('mapMarker').attrs.visibility,'visible');const loc=ctx.AsaraGame.LOCATIONS[u.game.news.location];assert.equal(u.el('mapMarker').attrs.transform,`translate(${loc.x} ${loc.y})`);
 u.el('mapToggle').click();assert.equal(u.el('mapToggle').attrs['aria-expanded'],'true');
 u.game.cash=TARGET;u.advance(1000);u.el('restartButton').click();
 assert.equal(u.game.mapState?.eventId,u.game.news.location?'opening-'+u.game.opening:undefined);assert.equal(u.game.chain,null);assert.equal(u.game.nextNewsTick,20);assert.equal(u.game.lastChain,null);
 assert.equal(u.el('mapMarker').attrs.visibility,u.game.news.location?'visible':'hidden');assert.equal(u.game.lastWork,null);assert.equal(u.game.reached.length,0);assert(u.el('workSummary').hidden);assert(u.el('newsReader').hidden);
 assert.equal(u.el('mapToggle').attrs['aria-expanded'],'false');assert.equal(u.el('newsSource').textContent,'卫队广播');assert.equal(u.game.events.length,0);
});
test('news appears on every affected stock and history reveals source and location',()=>{
 const u=setupUI();u.el('startButton').click();for(let i=0;i<22;i++)u.advance(1000);
 const n=u.game.events.find(e=>e.type==='news');
 for(let i=0;i<3;i++){if(n.effects[i]===0)continue;u.el('stock'+i).click();assert.match(u.el('chart').innerHTML,/>!<\/text>/);u.inspect(n.candle);assert(u.el('inspectText').textContent.includes(n.title));assert(u.el('inspectText').textContent.includes(ctx.AsaraGame.LOCATIONS[n.location].name));}
});
test('historical range ignores current extreme prices and offscreen average cost',()=>{
 const u=setupUI();u.el('startButton').click();for(let i=0;i<180;i++)u.advance(1000);
 u.inspect(0);const before=u.el('chart').innerHTML;
 u.game.stocks[0].price=100000000;u.inspect(0);assert.equal(u.el('chart').innerHTML,before);
 u.game.stocks[0].shares=1;u.game.stocks[0].cost=99999999;u.inspect(0);assert.equal(u.el('chart').innerHTML,before);assert.match(u.el('costLegend').textContent,/成本在图外/);
});
test('same-candle transaction inspection retains quantities, prices and every fee',()=>{
 const u=setupUI();u.el('startButton').click();u.el('buyButton').click();u.advance(400);u.el('sellButton').click();
 assert.match(u.el('inspectText').textContent,/买入249股 @ 20.00 哈夫币，费用 4.98 哈夫币/);
 assert.match(u.el('inspectText').textContent,/卖出124股 @ 20.00 哈夫币，费用 2.48 哈夫币/);
 assert.match(u.el('chart').innerHTML,/>↕<\/text>/);
});
test('work stops mid-day as soon as market value crosses target',()=>{
 const g=new Game(()=>.99);g.start();g.stocks[0].shares=100;g.cash=TARGET-100*g.stocks[0].price-g.workOffer.wage-100;
 const r=g.work();assert.equal(g.status,'ended');assert(g.won);assert(r.elapsed>0&&r.elapsed<WORK_TICKS);assert.equal(g.ticks,r.elapsed);assert.equal(g.wages,r.wage);
});
test('pausing after multiple days preserves actual day and permits chart and map inspection',()=>{
 const u=setupUI();u.el('startButton').click();for(let i=0;i<241;i++)u.advance(1000);u.el('pauseButton').click();
 assert.equal(u.el('dayValue').textContent,'13');assert(u.el('chartCover').hidden);assert.equal(u.el('dayCountdown').textContent,'时间已暂停');
 u.inspect(4);assert.match(u.el('inspectText').textContent,/第2天/);
 u.el('mapToggle').click();assert.equal(u.el('mapToggle').attrs['aria-expanded'],'true');assert(!u.el('app').inert);assert.equal(u.game.status,'paused');assert(!html.includes('id="expandMap"'));assert(!html.includes('id="mapOverlay"'));
});
test('only best score is persisted, and no RMB symbols or external asset requests remain',()=>{
 const u=setupUI();u.el('startButton').click();u.game.cash=TARGET;u.advance(1000);assert.deepEqual([...u.saved.keys()],['asara.best.v1']);
 assert(!/[¥￥]/.test(html));assert(!/赚500元/.test(html));assert(html.includes('assets/zero-dam.png'));assert(html.includes('assets/havvk-coin.png'));
 const crypto=require('node:crypto'),path=require('node:path');
 const digest=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'..',f))).digest('hex');
 assert.equal(digest('dist/assets/zero-dam.png'),digest('reference/assets/image(20261014-104457).png'));
 assert.equal(digest('dist/assets/havvk-coin.png'),digest('reference/assets/image(20261014-104657).png'));
});
test('three openings initialize distinct playable conditions without changing initial capital',()=>{
 const ids=new Set();for(const r of [.01,.5,.99]){const g=new Game(()=>r);g.start();ids.add(g.opening);assert.equal(g.total,START);assert.equal(g.news.tick,0);assert.equal(g.events.length,0);assert.equal(g.status,'running');}
 assert.deepEqual([...ids],['routine','road','power']);
});
test('regional conditions persist across unrelated news and change only with a relevant update',()=>{
 const g=new Game(()=>.01);g.start();g.chain={id:'blockade',step:0};g.makeNews();assert.equal(g.regions.road,'blocked');
 g.chain={id:'haavk-audit',step:0};g.makeNews();assert.equal(g.regions.road,'blocked');assert.equal(g.regions.admin,'alert');
 g.chain={id:'road-repair',step:1};g.makeNews();assert.equal(g.regions.road,'limited');assert.equal(g.regions.admin,'alert');
 const snapshot=g.events[0].regions;assert.equal(snapshot.road,'blocked');g.reset();assert.equal(g.regions.road,'clear');assert.equal(g.regions.admin,'normal');
});
test('roads and power affect actual prices and delivery outcome probabilities',()=>{
 const a=new Game(seeded(92)),b=new Game(seeded(92));a.start();b.start();a.regions.road='clear';a.regions.power='stable';b.regions.road='blocked';b.regions.power='limited';
 for(let i=0;i<20;i++){a.tick();b.tick();}assert(b.stocks[1].price<a.stocks[1].price);assert(b.stocks[2].price<a.stocks[2].price);
 for(const [road,power,expected] of [['clear','stable','delivery-arrived'],['blocked','limited','delivery-backlog']]){
  const g=new Game(()=>.5);g.start();g.regions.road=road;g.regions.power=power;g.chain={id:'delivery-contract',step:1};g.makeNews();assert.equal(g.news.id,expected);
 }
});
test('event selection respects existing restrictions, avoids immediate repeats and finishes chains before close',()=>{
 const first=new Set();for(let seed=1;seed<=50;seed++){
  const g=new Game(seeded(seed));g.start();g.regions.road='blocked';g.regions.power='limited';g.makeNews();first.add(g.news.chain);assert(!['blockade','route-inspection','power-inspection'].includes(g.news.chain));
  while(g.status==='running')g.tick();assert.equal(g.chain,null);
  const starts=g.events.filter(n=>n.type==='news'&&n.stage===1);for(let i=1;i<starts.length;i++)assert.notEqual(starts[i].chain,starts[i-1].chain);
 }assert(first.size>4);
});
test('work summary accounts for wages, market movement and only news during the job',()=>{
 const g=new Game(seeded(73));g.start();g.trade(1,'buy',1);for(let i=0;i<15;i++)g.tick();const before=g.total,job=g.job,quoted=g.workOffer.wage;const r=g.work();
 assert.equal(r.job,job);assert.equal(r.elapsed,10);assert.equal(r.wage,quoted);assert.equal(r.holdingChange,g.total-before-quoted);assert.equal(r.news.length,1);assert.equal(r.news[0].tick,20);
 const next=g.work();assert.equal(next.news.length,0);assert.equal(next.elapsed,10);
});
test('last half-day is usable, insufficient time blocks work without charging or crediting',()=>{
 for(const remaining of [10,9]){const g=new Game(seeded(11));g.start();while(g.remaining>remaining)g.tick();const cash=g.cash,r=g.work();if(remaining===10){assert.equal(r.elapsed,10);assert.equal(g.status,'ended');assert.equal(g.cash,cash+r.wage);}else{assert.equal(r,null);assert.equal(g.cash,cash);assert.equal(g.remaining,9);}}
});
test('milestones grant no money, are remembered once and reset completely',()=>{
 const g=new Game();g.start();g.cash=3000000;g.checkEnd();assert.equal(g.cash,3000000);assert.equal(g.reached.length,1);g.cash=START;g.checkEnd();g.cash=3000000;g.checkEnd();assert.equal(g.reached.length,1);
 g.cash=TARGET;g.checkEnd();assert.equal(g.reached.length,4);assert(g.won);g.reset();assert.equal(g.reached.length,0);
});
test('per-stock net contribution reconciles exactly with total capital and wages',()=>{
 for(let seed=1;seed<=40;seed++){
  const g=new Game(seeded(seed));g.start();for(let i=0;i<15;i++){g.trade(i%3,'buy',.5);g.work();g.trade((i+1)%3,'sell',.5);}
  const net=g.stocks.reduce((sum,s)=>sum+s.realized+s.shares*s.price-s.cost,0);
  assert.equal(net,g.tradingPnl);assert.equal(START+g.wages+net,g.total);assert.equal(g.realized,g.stocks.reduce((sum,s)=>sum+s.realized,0));
 }
});
test('trade previews include cash impact and fees, and tabs expose other holdings',()=>{
 const u=setupUI();u.el('startButton').click();assert.match(u.el('buyPreview').textContent,/买 249 股 · 支出 4,984.98\n含费 4.98/);
 u.el('buyButton').click();assert.match(u.el('sellPreview').textContent,/卖 124 股 · 到账 2,477.52\n扣费 2.48/);u.el('stock1').click();assert.match(u.el('tabPosition0').textContent,/249股/);assert.equal(u.el('tabPosition1').textContent,'未持仓');
});
test('broadcast reader preserves all full messages with sources and uncertainty, one at a time',()=>{
 const u=setupUI();u.el('startButton').click();for(let i=0;i<150;i++)u.advance(1000);
 const news=u.game.events.filter(e=>e.type==='news');assert.equal(u.el('archiveCount').textContent,news.length);u.el('newsArchive').click();
 for(const n of news){u.el('broadcastSelect').value=n.tick;u.el('broadcastSelect').handlers.change();assert(u.el('readerContent').innerHTML.includes(n.title));assert(u.el('readerContent').innerHTML.includes(n.source));}
 u.el('readerClose').click();assert(u.el('newsReader').hidden);assert(!u.el('app').inert);
 for(let i=0;i<3;i++)if(u.game.news.effects[i])assert(u.el('eventImpacts').innerHTML.includes(u.game.news.impact[i]));assert(!u.el('eventImpacts').innerHTML.includes('>利好<'));
});
test('UI work report and settlement explain wages and trading returns independently',()=>{
 const u=setupUI();u.el('startButton').click();u.el('buyButton').click();for(let i=0;i<15;i++)u.advance(1000);u.el('workButton').click();assert.match(u.el('workSummary').textContent,/期间持仓 .*收到 1 条广播/);assert(!u.el('workSummary').hidden);
 while(u.game.status==='running')u.advance(1000);
 assert.equal(u.el('endWages').textContent,(u.game.wages/100).toLocaleString('zh-CN'));assert.match(u.el('endTrading').textContent,/哈夫币/);for(const s of u.game.stocks)assert(u.el('resultStocks').innerHTML.includes(s.name));
});
test('job wages vary, remain within the displayed range and avoid the last two completed jobs',()=>{
 const jobs=new Set(),wages=new Set();for(let seed=1;seed<=40;seed++){
  const g=new Game(seeded(seed));g.start();const recent=[];
  while(g.status==='running'){
   const offer={...g.workOffer};assert(!recent.includes(offer.id));assert(offer.wage>=50000&&offer.wage<=200000);assert(Number.isInteger(offer.wage));
   const r=g.work();assert.equal(r.wage,offer.wage);assert.equal(r.result,offer.result);jobs.add(r.id);wages.add(r.wage);recent.push(r.id);if(recent.length>2)recent.shift();
  }
 }assert.equal(jobs.size,12);assert(wages.size>=10);assert.equal(Math.min(...wages),50000);assert.equal(Math.max(...wages),200000);
});
test('job quotes cannot be rerolled through rendering, stock selection or pause',()=>{
 const u=setupUI();u.el('startButton').click();const offer=JSON.stringify(u.game.workOffer),seed=u.game.jobSeed;
 for(let i=0;i<3;i++)u.el('stock'+i).click();u.el('pauseButton').click();u.el('range3').click();u.el('allButton').click();u.el('pauseButton').click();
 assert.equal(JSON.stringify(u.game.workOffer),offer);assert.equal(u.game.jobSeed,seed);assert(u.el('workHelp').textContent.includes((u.game.workOffer.wage/100).toLocaleString('zh-CN')));
});
test('conditional jobs expire when their situation clears, but an accepted quote is honored',()=>{
 const g=new Game(seeded(42));g.start();g.regions.power='limited';const job=JOBS.find(j=>j.id==='powerwork');
 const offer={...job,wage:180000,ticks:WORK_TICKS};g.workOffer=offer;g.chain={id:'power-repair',step:1};g.makeNews();assert.equal(g.regions.power,'stable');assert.notEqual(g.workOffer.id,'powerwork');
 g.regions.power='limited';g.workOffer=offer;g.chain={id:'power-repair',step:1};g.ticks=15;const r=g.work();assert.equal(g.regions.power,'stable');assert.equal(r.id,'powerwork');assert.equal(r.wage,180000);assert.notEqual(g.workOffer.id,'powerwork');
});
test('job random state and completed work are cleared on restart',()=>{
 const g=new Game(seeded(66));g.start();g.work();assert(g.recentJobs.length);g.reset();assert.equal(g.jobSeed,0);assert.equal(g.workOffer,null);assert.equal(g.lastWork,null);assert.equal(g.recentJobs.length,0);assert.equal(g.inJob,false);g.start();assert(g.workOffer);assert.equal(g.wages,0);
});
console.log('\n'+checks+' checks passed. Logic and DOM harness; browser results are reported separately.');
