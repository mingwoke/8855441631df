// Reproducible game-balance samples. These strategies do not see future prices.
// Optional ASARA_BASELINE points to a previous index.html for a volatility comparison.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
function engine(file){const html=fs.readFileSync(file,'utf8'),context={};vm.createContext(context);vm.runInContext(html.match(/<script id="engine">([\s\S]*?)<\/script>/)[1],context);return context.AsaraGame;}
function seeded(seed){return ()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
const api=engine(path.join(root,'dist/index.html'));
const quantile=(values,p)=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.floor((sorted.length-1)*p)];};
function distribution(values){return {min:Math.min(...values),median:quantile(values,.5),p90:quantile(values,.9),p95:quantile(values,.95),max:Math.max(...values)};}
function volatility(api,count,check){
 const normal=[],event=[],absolute=[],daily=[],opening={},chains=new Set();let maximumTick=0;
 for(let seed=1;seed<=count;seed++){
  const g=new api.Game(seeded(seed));g.start();opening[g.opening||'fixed']=(opening[g.opening||'fixed']||0)+1;
  while(g.status==='running'){
   const previous=g.stocks.map(s=>s.price);g.tick();
   g.stocks.forEach((s,i)=>{
    const step=Math.abs(s.price/previous[i]-1);maximumTick=Math.max(maximumTick,step);
    if(check)assert(step<=Math.exp(.012)-1+1/previous[i],'single-tick jump exceeds rounding-aware limit');
    if(g.ticks%20===0){const change=(s.price/s.open-1)*100;daily.push(change);absolute.push(Math.abs(change));(s.eventDay?event:normal).push(Math.abs(change));
     if(check)assert(Math.abs(change)<=(s.eventDay?22:12)+1e-6,'daily bound exceeded');
    }
   });
  }
  for(const e of g.events)if(e.chain)chains.add(e.chain);
 }
 return {games:count,maximumSingleTickPercent:maximumTick*100,absoluteDailyPercent:distribution(absolute),ordinaryAbsoluteDailyPercent:distribution(normal),eventAbsoluteDailyPercent:event.length?distribution(event):null,percentDaysWithinEight:100*absolute.filter(x=>x<=8).length/absolute.length,openingCounts:opening,eventGroupsSeen:chains.size};
}
function strategy(name,count,fn){
 const endings=[];let wins=0,losses=0;const milestones={30000:0,100000:0,300000:0};
 for(let seed=1;seed<=count;seed++){
  const g=new api.Game(seeded(seed));g.start();fn(g);
  assert.equal(g.status,'ended');endings.push(g.total/100);if(g.won)wins++;if(g.total<api.START)losses++;
  for(const mark of Object.keys(milestones))if(g.reached.includes(Number(mark)*100))milestones[mark]++;
 }
 return {name,games:count,wins,losses,everReached:milestones,endingAssets:distribution(endings)};
}
const report={date:new Date().toISOString(),target:api.TARGET/100,market:volatility(api,1000,true),strategies:[]};
if(process.env.ASARA_BASELINE)report.previousMarket=volatility(engine(process.env.ASARA_BASELINE),1000,false);
for(let i=0;i<3;i++)report.strategies.push(strategy('开局全仓持有 '+api.SPECS[i].name,300,g=>{g.trade(i,'buy',1);while(g.status==='running')g.tick();}));
report.strategies.push(strategy('只打工',1,g=>{while(g.status==='running')g.work();}));
report.strategies.push(strategy('每半天看过去涨幅，持仓配合打工',300,g=>{
 while(g.status==='running'){
  const scores=g.stocks.map(s=>s.history.length>10?s.price/s.history.at(-11)-1:0),best=scores.indexOf(Math.max(...scores)),selected=scores[best]>.006?best:-1;
  for(let i=0;i<3;i++)if(i!==selected)g.trade(i,'sell',1);
  if(selected>=0)g.trade(selected,'buy',1);g.work();
 }
}));
report.strategies.push(strategy('每次广播按其方向参数换仓，其余时间等待',300,g=>{
 let lastNews=null;
 while(g.status==='running'){
  if(g.news.tick>0&&g.news.tick!==lastNews){lastNews=g.news.tick;const best=g.news.effects.indexOf(Math.max(...g.news.effects));
   for(let i=0;i<3;i++)g.trade(i,'sell',1);if(g.news.effects[best]>0)g.trade(best,'buy',1);
  }g.tick();
 }
}));
assert.equal(report.market.eventGroupsSeen,12);assert.equal(Object.keys(report.market.openingCounts).length,3);assert.equal(report.strategies.find(s=>s.name==='只打工').endingAssets.min,70000);
report.notes=['固定种子样本用于比较与回归，不代表玩家胜率或未来表现。','消息策略直接读取新闻方向参数，是测试用启发式；玩家看到的是业务说明，不是精确数值。','100 万仍是极难目标。样本没有达标不证明不可达，也不能据此宣称一般玩家能够通关。','所有持仓按最后市场价计算，未假设结算强制卖出。'];
fs.writeFileSync(path.join(root,'verification/balance-results.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
