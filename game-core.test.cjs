const {test}=require('node:test');
const assert=require('node:assert/strict');
const G=require('./game-core.js');
const fresh=()=>G.newGame(101);
test('initial map has four unique cores and connected territories',()=>{const s=fresh();assert.equal(s.tiles.length,81);assert.equal(s.tiles.filter(t=>t.hq).length,4);for(let i=0;i<4;i++)assert.equal(s.tiles.filter(t=>t.owner===i).length,5);});
test('construction spends exactly one action and its resource price',()=>{const s=fresh(),r=G.construct(s,'cannon',3,3);assert.ok(r.ok);assert.equal(s.credits,340);assert.equal(s.buildActions,1);});
test('construction rejects core, outer ring, occupied, fractional and unaffordable cells',()=>{const s=fresh();for(const [type,x,y] of [['hq',2,2],['cannon',0,0],['cannon',6,5],['cannon',2.5,2]])assert.equal(G.construct(s,type,x,y).ok,false);s.credits=0;assert.equal(G.construct(s,'cannon',2,2).ok,false);assert.equal(s.buildActions,2);});
test('two actions are a hard construction limit; other phases reject building',()=>{const s=fresh();G.construct(s,'cannon',2,2);G.construct(s,'cannon',3,3);assert.equal(G.construct(s,'cannon',2,3).ok,false);s.phase=1;s.buildActions=2;assert.equal(G.construct(s,'cannon',2,3).ok,false);});
test('tech upgrade preserves damage ratio and gates military separately',()=>{const s=fresh(),hq=s.factions[0].base[0];hq.hp=310;assert.ok(G.upgradeTech(s).ok);assert.equal(s.tech,2);assert.ok(Math.abs(hq.hp/hq.maxHp-.5)<.002);assert.equal(s.unlocked.robot,false);assert.ok(G.unlockUnit(s,'robot').ok);assert.equal(s.reserve.robot,4);});
test('unit research cannot bypass technology or duplicate units',()=>{const s=fresh();assert.equal(G.unlockUnit(s,'siege').ok,false);assert.equal(G.unlockUnit(s,'drone').ok,false);assert.equal(s.credits,460);});
test('moving is phase limited, core fixed, occupancy checked and costs one step',()=>{const s=fresh(),b=s.factions[0].base[1];assert.equal(G.moveBuilding(s,b.id,2,2).ok,false);s.phase=1;assert.equal(G.moveBuilding(s,s.factions[0].base[0].id,2,2).ok,false);assert.equal(G.moveBuilding(s,b.id,6,5).ok,false);assert.ok(G.moveBuilding(s,b.id,2,2).ok);assert.equal(s.moves,2);});
test('AI layouts never overlap facilities or exceed move budget',()=>{for(let layout=0;layout<3;layout++){const bs=G.base(3),before=G.clone(bs),n=G.applyLayout(bs,layout,3);assert.ok(n<=3);assert.equal(new Set(bs.map(b=>b.x+','+b.y)).size,bs.length);assert.equal(bs[0].x,before[0].x);assert.ok(bs.filter((b,i)=>b.x!==before[i].x||b.y!==before[i].y).length<=3);}});
test('repairs revive non-core facilities and spend correct money',()=>{const s=fresh(),b=s.factions[0].base[1];s.phase=2;b.hp=0;const cost=G.repairCost(b);assert.ok(G.repair(s,b.id).ok);assert.equal(b.hp,b.maxHp);assert.equal(s.credits,460-cost);assert.equal(s.repairActions,1);});
test('production requires unlocked unique choices and at least one unit type',()=>{const s=fresh(),b=s.factions[0].base.find(b=>b.type==='barracks');assert.equal(G.setProduction(s,b.id,['robot']),false);assert.equal(G.setProduction(s,b.id,[]),false);assert.equal(G.setProduction(s,b.id,['dog','dog']),false);assert.ok(G.setProduction(s,b.id,['dog']));s.phase=1;assert.equal(G.setProduction(s,b.id,['drone']),false);});
test('each intact barracks produces and destroyed reactors stop income',()=>{const s=fresh(),b=s.factions[0].base.find(b=>b.type==='barracks'),r=s.factions[0].base.find(b=>b.type==='reactor'),start=G.income(s);b.production=['dog'];G.nextRound(s);assert.equal(s.reserve.dog,14);r.hp=0;assert.equal(G.income(s),start-25);b.hp=0;const count=s.reserve.dog;G.nextRound(s);assert.equal(s.reserve.dog,count);});
test('reserves clamp at 60 and armory upgrades improve production',()=>{const s=fresh();G.upgradeArmory(s);s.reserve.dog=59;s.reserve.drone=59;G.nextRound(s);assert.equal(s.reserve.dog,60);assert.equal(s.reserve.drone,60);});
test('only adjacent neutral tiles can be occupied during attack',()=>{const s=fresh(),t=G.borderTargets(s).find(t=>t.owner<0),index=s.tiles.indexOf(t);assert.equal(G.occupy(s,index),false);s.phase=3;assert.equal(G.occupy(s,0),false);assert.ok(G.occupy(s,index));assert.equal(s.credits,420);assert.equal(t.owner,0);});
test('army planner honors technology, inventory and capacity',()=>{const a=G.planArmy(3,1,{drone:3,dog:2,robot:9,siege:9,jammer:9},20);assert.equal(a.length,5);assert.equal(a.filter(t=>t==='drone').length,3);assert.ok(a.every(t=>G.UNIT[t].tech<=1));});
test('battle is idle until deployment and terminates with no attackers once committed',()=>{const b=new G.Battle(G.base());b.step(1);assert.equal(b.time,0);b.committed=true;b.step(.1);assert.ok(b.ended);assert.equal(b.won,false);});
test('combat actually damages structures and guards',()=>{const b=new G.Battle(G.base(),101,['dog']);b.deploy('robot',5,6,3);b.committed=true;for(let i=0;i<100&&!b.ended;i++)b.step(.1);assert.ok(b.guards[0].hp<b.guards[0].maxHp);assert.ok(b.units[0].hp<b.units[0].maxHp);});
test('shield reduces direct damage; screen shell disables shield reduction',()=>{const bs=[G.building('hq',6,5),G.building('shield',5,5)],b=new G.Battle(bs);const h=b.buildings[0],max=h.hp;b.damageBuilding(h,100);assert.equal(h.hp,max-75);b.spell('jam',5,5);b.damageBuilding(h,100);assert.equal(h.hp,max-175);});
test('strategic bombardment scales with technology and victory is core-based',()=>{const a=new G.Battle([G.building('hq',6,5)]),b=new G.Battle([G.building('hq',6,5)]);a.spell('bomb',6,5,1);b.spell('bomb',6,5,3);assert.equal(a.buildings[0].hp-b.buildings[0].hp,70);b.buildings[0].hp=0;b.committed=true;b.step(.1);assert.ok(b.won);});
test('simulations are reproducible for fixed settings',()=>{const bs=G.base(2),army=G.planArmy(5,2,{drone:30,dog:30,robot:30,siege:30,jammer:30},12),a=G.simulatedBattle(bs,army,51,2,['dog']),b=G.simulatedBattle(bs,army,51,2,['dog']);assert.equal(a.won,b.won);assert.equal(a.destruction,b.destruction);assert.equal(a.survivors,b.survivors);});
test('attacks retain building damage and return survivors, not casualties',()=>{const s=fresh(),t=s.tiles.find(t=>t.owner===1&&t.hq),b=new G.Battle(s.factions[1].base);b.buildings[1].hp=10;b.units=[{type:'dog',hp:2},{type:'drone',hp:0}];b.won=false;G.settleAttack(s,s.tiles.indexOf(t),b);assert.equal(s.reserve.dog,11);assert.equal(s.reserve.drone,12);assert.equal(s.factions[1].base[1].hp,10);});
test('core conquest eliminates faction and leaves its other tiles neutral',()=>{const s=fresh(),t=s.tiles.find(t=>t.owner===1&&t.hq),b=new G.Battle(s.factions[1].base);b.won=true;G.settleAttack(s,s.tiles.indexOf(t),b);assert.equal(s.factions[1].alive,false);assert.equal(t.owner,0);assert.equal(s.tiles.filter(t=>t.owner===1).length,0);});
test('last survivor wins; player core failure loses and stops phase changes',()=>{const s=fresh();for(let i=1;i<4;i++)G.eliminate(s,i);assert.equal(s.outcome,'victory');assert.equal(G.advancePhase(s),false);const l=fresh();G.eliminate(l,0);assert.equal(l.outcome,'defeat');});
test('enemy turns use combat, leave persistent damage, and can end campaign',()=>{const s=fresh();let reports=[];for(let i=0;i<15&&!s.outcome;i++){s.phase=3;reports.push(...G.enemyTurn(s));G.nextRound(s);}assert.ok(reports.length>0);assert.equal(s.outcome,'defeat');assert.ok(reports.some(r=>r.defender===0));});
test('training updates attack and defense tables once per sample',()=>{const a=G.newAgent();for(let i=0;i<40;i++)G.trainEpisode(a,104729+i*7919);assert.equal(a.episodes,40);assert.equal(a.attackN.flat().reduce((s,n)=>s+n,0),40);assert.equal(a.defenseN.flat().reduce((s,n)=>s+n,0),40);assert.equal(a.history.length,4);assert.ok(a.attackQ.flat().some(n=>n>0));});
test('independent evaluation is reproducible and does not train on holdout',()=>{const a=G.newAgent();for(let i=0;i<120;i++)G.trainEpisode(a,104729+i*7919);const before=JSON.stringify(a.attackN),r=G.evaluateAgent(a),again=G.evaluateAgent(a);assert.deepEqual(r,again);assert.equal(JSON.stringify(a.attackN),before);assert.equal(a.episodes,120);assert.ok(r.trainedWins<=36);assert.ok(r.baselineWins<=36);});

test('restored building IDs cannot collide with new enemy facilities',()=>{const s=fresh();s.factions[1].base[0].id='b999999';G.syncBuildingIds(s);assert.ok(Number(G.building('cannon',2,2).id.slice(1))>999999);});
test('bombing can finish a damaged core before any units are deployed',()=>{const core=G.building('hq',6,5);core.hp=40;const b=new G.Battle([core]);b.spell('bomb',6,5);b.step(G.TICK);assert.equal(b.ended,true);assert.equal(b.won,true);assert.equal(b.deployed,0);});
test('bombardment starts timer and persists damage even without deployment',()=>{const b=new G.Battle(G.base());b.spell('bomb',6,5);b.step(G.TICK);assert.equal(b.ended,false);assert.ok(b.time>0);assert.ok(b.destruction>0);while(!b.ended)b.step(G.TICK);assert.equal(b.won,false);assert.ok(b.time>=60);});

// Regression coverage for sequential ownership and region-specific defenses.
test('E7 cannot be recaptured in the capture round, but is available next round',()=>{
  const s=fresh(),i=6*9+4,t=s.tiles[i];t.owner=1;t.hq=false;
  const a=G.bindAttack(s,i,new G.Battle(G.targetBase(s,t)));a.won=true;a.buildings[0].hp=0;
  assert.ok(G.settleAttack(s,i,a,0).ok);assert.equal(t.owner,0);assert.equal(t.capturedRound,1);
  const b=G.bindAttack(s,i,new G.Battle(G.targetBase(s,t)));b.won=true;b.buildings[0].hp=0;
  const before=JSON.stringify(s);assert.equal(G.settleAttack(s,i,b,1).ok,false);assert.equal(JSON.stringify(s),before);
  assert.equal(s.log.filter(e=>e.tile===i).length,1);G.nextRound(s);
  assert.equal(G.isProtected(s,t),false);assert.ok(G.settleAttack(s,i,b,1).ok);assert.equal(t.owner,1);
  const events=s.log.filter(e=>e.tile===i);assert.equal(events.length,2);assert.ok(events[0].seq>events[1].seq);
  assert.deepEqual(events.map(e=>[e.from,e.to]),[[0,1],[1,0]]);assert.deepEqual(events.map(e=>e.round),[2,1]);
});
test('a battle can only settle once, including rewards and surviving troops',()=>{
  const s=fresh(),i=s.tiles.findIndex(t=>t.owner===1&&!t.hq),b=G.bindAttack(s,i,new G.Battle(G.targetBase(s,s.tiles[i])));
  b.won=true;b.units=[{type:'dog',hp:20}];assert.ok(G.settleAttack(s,i,b).ok);
  const before=JSON.stringify(s);assert.equal(G.settleAttack(s,i,b).ok,false);assert.equal(JSON.stringify(s),before);
});
test('stale results cannot overwrite a territory even if its old owner returns',()=>{
  const s=fresh(),i=s.tiles.findIndex(t=>t.owner===1&&!t.hq),t=s.tiles[i];
  const stale=G.bindAttack(s,i,new G.Battle(G.targetBase(s,t)));stale.won=true;
  for(const id of [0,1]){const b=G.bindAttack(s,i,new G.Battle(G.targetBase(s,t)));b.won=true;assert.ok(G.settleAttack(s,i,b,id).ok);G.nextRound(s);}
  assert.equal(t.owner,1);const before=JSON.stringify(s);assert.equal(G.settleAttack(s,i,stale).ok,false);assert.equal(JSON.stringify(s),before);
});
test('older saves retain data and acquire monotonic event IDs and revisions',()=>{
  const s=fresh();s.log=[{round:2,text:'new'},{round:1,text:'old'}];G.normalizeState(s);
  assert.equal(s.log[0].seq,2);assert.equal(s.log[1].seq,1);assert.ok(s.tiles.every(t=>t.revision===0));
  G.log(s,'next');assert.equal(s.log[0].seq,3);const loaded=JSON.parse(JSON.stringify(s));G.normalizeState(loaded);G.log(loaded,'after load');assert.equal(loaded.log[0].seq,4);
});
test('regional defenses are persistent, independent and not regenerated on inspection',()=>{
  const s=fresh(),tiles=s.tiles.filter(t=>t.owner===0&&!t.hq),a=G.targetBase(s,tiles[0]),b=G.targetBase(s,tiles[1]);
  assert.notEqual(a,b);a[1].x=1;a[1].hp=7;const ids=a.map(x=>x.id);
  assert.equal(G.targetBase(s,tiles[0]),a);assert.deepEqual(G.targetBase(s,tiles[0]).map(x=>x.id),ids);
  assert.equal(a[1].hp,7);assert.notEqual(b[1].hp,7);assert.notEqual(s.factions[0].base[1].hp,7);
  const layouts=new Set([0,1,2].map(i=>JSON.stringify(G.outpost(1,i).map(b=>[b.x,b.y]))));assert.equal(layouts.size,3);
});
test('selected-region moves are used by the actual enemy battle and replay snapshot',()=>{
  const s=fresh();s.round=1;s.phase=1;
  s.tiles.forEach(t=>{t.owner=-1;t.hq=false;t.base=null;});s.factions[2].alive=s.factions[3].alive=false;
  const home=s.tiles[6*9+1],t=s.tiles[6*9+4],enemy=s.tiles[6*9+5];home.owner=0;home.hq=true;t.owner=0;enemy.owner=1;enemy.hq=true;
  s.defenseTile=s.tiles.indexOf(t);const bs=G.defenseBase(s),tower=bs[1];assert.ok(G.moveBuilding(s,tower.id,2,2).ok);tower.hp=19;
  const expected=G.clone(bs),reports=G.enemyTurn(s),r=reports.find(r=>r.index===s.tiles.indexOf(t));assert.ok(r);
  assert.equal(r.sector,'E7');assert.equal(r.hq,false);assert.deepEqual(r.buildings,expected);
  assert.notDeepEqual(r.buildings.map(b=>[b.x,b.y]),s.factions[0].base.map(b=>[b.x,b.y]));
  const replay=new G.Battle(r.buildings,r.seed,r.guards);assert.deepEqual(replay.buildings.map(b=>[b.id,b.x,b.y,b.hp]),expected.map(b=>[b.id,b.x,b.y,b.hp]));
  const rerun=G.simulatedBattle(r.buildings,r.army,r.seed,r.level,r.guards,r.side);assert.equal(rerun.won,r.result.won);assert.equal(rerun.destruction,r.result.destruction);
});
test('a main-core attack uses the main layout, not an outpost template',()=>{
  const s=fresh();s.phase=1;s.tiles.forEach(t=>{t.owner=-1;t.hq=false;});s.factions[2].alive=s.factions[3].alive=false;
  const home=s.tiles[6*9+1],enemy=s.tiles[6*9+2];home.owner=0;home.hq=true;enemy.owner=1;enemy.hq=true;
  const tower=s.factions[0].base[1];G.moveBuilding(s,tower.id,1,1);const expected=G.clone(s.factions[0].base);
  const r=G.enemyTurn(s).find(r=>r.defender===0);assert.ok(r);assert.equal(r.hq,true);assert.equal(r.sector,'B7');assert.deepEqual(r.buildings,expected);
});
test('main and regional layouts share one move budget without touching each other',()=>{
  const s=fresh();s.phase=1;const i=s.tiles.findIndex(t=>t.owner===0&&!t.hq),main=G.clone(s.factions[0].base);s.defenseTile=i;
  const region=G.defenseBase(s);assert.ok(G.moveBuilding(s,region[1].id,1,1).ok);assert.equal(s.moves,2);assert.deepEqual(s.factions[0].base,main);
  s.defenseTile=null;assert.equal(G.moveBuilding(s,region[2].id,2,2).ok,false);assert.ok(G.moveBuilding(s,main[1].id,2,2).ok);assert.equal(s.moves,1);
});
test('regional construction is defensive, charged and capped at five facilities',()=>{
  const s=fresh();s.defenseTile=s.tiles.findIndex(t=>t.owner===0&&!t.hq);const before=s.credits;
  assert.equal(G.construct(s,'reactor',1,1).ok,false);assert.equal(G.construct(s,'barracks',1,1).ok,false);assert.equal(s.credits,before);
  assert.ok(G.construct(s,'cannon',1,1).ok);assert.ok(G.construct(s,'cannon',2,1).ok);assert.equal(s.credits,before-240);
  assert.equal(G.defenseBase(s).length,5);s.buildActions=2;assert.equal(G.construct(s,'cannon',3,1).ok,false);assert.equal(s.factions[0].base.length,5);
});
test('regional repairs and tech upgrades preserve the correct scoped facilities',()=>{
  const s=fresh();s.defenseTile=s.tiles.findIndex(t=>t.owner===0&&!t.hq);const bs=G.defenseBase(s),tower=bs[1];tower.hp=30;const before=G.clone(s.factions[0].base);
  s.phase=2;assert.ok(G.repair(s,tower.id).ok);assert.equal(tower.hp,tower.maxHp);assert.deepEqual(s.factions[0].base,before);
  tower.hp=0;s.phase=0;assert.ok(G.upgradeTech(s).ok);assert.equal(tower.level,2);assert.equal(tower.hp,0);
});
test('capturing a region preserves tower positions and damage; only node reboots',()=>{
  const s=fresh(),i=s.tiles.findIndex(t=>t.owner===1&&!t.hq),t=s.tiles[i],bs=G.targetBase(s,t);bs[1].x=1;bs[1].y=9;
  const b=G.bindAttack(s,i,new G.Battle(bs));b.won=true;b.buildings[0].hp=0;b.buildings[1].hp=9;b.buildings[2].hp=0;G.settleAttack(s,i,b);
  assert.equal(t.owner,0);assert.equal(t.base[0].hp,t.base[0].maxHp);assert.deepEqual([t.base[1].x,t.base[1].y,t.base[1].hp],[1,9,9]);assert.equal(t.base[2].hp,0);
  assert.equal(G.targetBase(s,t),t.base);
});
test('region selection, coordinates and battle damage survive saving and loading',()=>{
  const s=fresh();s.defenseTile=s.tiles.findIndex(t=>t.owner===0&&!t.hq);const b=G.defenseBase(s)[1];b.x=2;b.y=9;b.hp=17;
  const loaded=G.normalizeState(JSON.parse(JSON.stringify(s)));assert.equal(loaded.defenseTile,s.defenseTile);assert.deepEqual(G.defenseBase(loaded),G.defenseBase(s));
  loaded.tiles[loaded.defenseTile].owner=1;G.normalizeState(loaded);assert.equal(loaded.defenseTile,null);assert.equal(G.defenseBase(loaded),loaded.factions[0].base);
});
test('preset layout swaps finish without overlap and charge temporary moves',()=>{
  const bs=[G.building('hq',6,5),G.building('cannon',7,4),G.building('cannon',4,4)];
  assert.equal(G.applyLayout(bs,0,1),1);assert.equal(new Set(bs.map(b=>b.x+','+b.y)).size,3);
  const rest=G.applyLayout(bs,0,3);assert.equal(rest,2);assert.deepEqual(bs.slice(1).map(b=>[b.x,b.y]),[[4,4],[7,4]]);
  assert.equal(G.applyLayout(bs,0,3),0);
  for(let a=0;a<3;a++)for(let b=0;b<3;b++){const base=G.base(3);G.applyLayout(base,a);G.applyLayout(base,b);assert.deepEqual(base.slice(1).map(x=>[x.x,x.y]),G.LAYOUTS[b].slots.slice(0,base.length-1));}
});

// v0.4: symmetric economy, inventory and capture protection.
test('new campaigns start with equal credits, research and reserves for every faction',()=>{
  const s=fresh();assert.equal(s.rulesVersion,5);
  for(let id=0;id<4;id++){const e=G.economy(s,id);assert.equal(e.credits,460);assert.equal(e.armoryLevel,1);assert.equal(G.reserveTotal(s,id),22);assert.equal(G.capacity(s,id),16);assert.deepEqual(e.unlocked,s.unlocked);}
});
test('legacy saves migrate once without changing player assets or generating advanced troops',()=>{
  const s=fresh();delete s.rulesVersion;s.round=21;s.credits=7;s.reserve.dog=2;s.log=[];
  for(const f of s.factions.slice(1)){delete f.reserve;delete f.unlocked;delete f.armoryLevel;f.tech=3;f.credits=13;}
  const owner=s.tiles.map(t=>t.owner),layout=G.clone(s.factions[0].base);G.normalizeState(s);
  assert.equal(s.credits,7);assert.equal(s.reserve.dog,2);assert.deepEqual(s.tiles.map(t=>t.owner),owner);assert.deepEqual(s.factions[0].base,layout);
  assert.ok(s.tiles.every(t=>!G.isProtected(s,t)));assert.equal(s.factions[1].reserve.drone,12);assert.equal(s.factions[1].reserve.siege,0);assert.equal(s.factions[1].unlocked.siege,false);
  s.factions[1].reserve.drone=0;const loaded=JSON.parse(JSON.stringify(s));G.normalizeState(loaded);G.normalizeState(loaded);
  assert.equal(loaded.factions[1].reserve.drone,0);assert.equal(loaded.factions[1].credits,13);assert.equal(loaded.version,2);
});
test('capturing neutral tiles costs every faction 40 and protects against every opponent',()=>{
  for(let id=0;id<4;id++){
    const s=fresh();s.phase=3;const t=G.actionTargets(s,id).find(t=>t.owner<0),i=s.tiles.indexOf(t),e=G.economy(s,id),before=e.credits;
    assert.ok(G.occupy(s,i,id));assert.equal(e.credits,before-40);assert.ok(G.isProtected(s,t));
    for(let attacker=0;attacker<4;attacker++)if(attacker!==id){const b=G.bindAttack(s,i,new G.Battle(G.targetBase(s,t)));b.won=true;assert.equal(G.settleAttack(s,i,b,attacker).ok,false);assert.equal(t.owner,id);}
  }
});
test('neutral occupation fails without money for both players and AI',()=>{
  for(const id of [0,1]){const s=fresh();s.phase=3;G.economy(s,id).credits=39;const t=G.borderTargets(s,id).find(t=>t.owner<0);assert.equal(G.occupy(s,s.tiles.indexOf(t),id),false);assert.equal(t.owner,-1);assert.equal(G.economy(s,id).credits,39);}
});
test('protection expires by round number, survives reload, and is cleared on elimination',()=>{
  const s=fresh();s.phase=3;const t=G.borderTargets(s).find(t=>t.owner<0),i=s.tiles.indexOf(t);G.occupy(s,i);
  const l=JSON.parse(JSON.stringify(s));G.normalizeState(l);assert.equal(l.tiles[i].capturedRound,1);assert.ok(G.isProtected(l,l.tiles[i]));
  G.nextRound(l);G.normalizeState(l);assert.equal(l.tiles[i].capturedRound,1);assert.equal(G.isProtected(l,l.tiles[i]),false);
  G.eliminate(s,0);assert.equal(t.owner,-1);assert.equal(t.capturedRound,undefined);
});
test('AI excludes protected targets rather than attacking and then discarding combat',()=>{
  const s=fresh();s.phase=3;s.tiles.forEach(t=>{t.owner=-1;t.hq=false;});s.factions[2].alive=s.factions[3].alive=false;
  const home=s.tiles[20],enemy=s.tiles[21];home.owner=0;home.hq=true;home.capturedRound=1;enemy.owner=1;enemy.hq=true;
  assert.ok(G.borderTargets(s,1).includes(home));assert.ok(!G.actionTargets(s,1).includes(home));
  const reports=G.enemyTurn(s);assert.ok(!reports.some(r=>r.index===20));assert.equal(home.owner,0);
});
test('income and production are paid at the same boundary, not on enemyTurn',()=>{
  const s=fresh(),before=s.factions.map(f=>G.economy(s,f.id).credits),gains=s.factions.map(f=>G.income(s,f.id));G.nextRound(s);
  for(let id=0;id<4;id++){const e=G.economy(s,id);assert.equal(e.credits,before[id]+gains[id]);assert.equal(e.reserve.drone,14);assert.equal(e.reserve.dog,12);assert.equal(e.lastProduction.income,gains[id]);assert.equal(Object.values(e.lastProduction.units).reduce((a,b)=>a+b,0),4);}
  const funds=s.factions[1].credits;G.enemyTurn(s);assert.ok(s.factions[1].credits<=funds);
});
test('every AI barracks follows level, damage, research, choice and storage limits',()=>{
  for(const level of [1,2,3]){
    const s=fresh(),f=s.factions[1];f.armoryLevel=level;f.tech=3;f.base=[G.building('hq',6,5),G.building('barracks',3,3),G.building('barracks',4,4)];f.base[2].hp=0;
    f.base[1].production=['drone','dog','siege','drone'];f.reserve.drone=59;f.reserve.dog=0;
    const batch=G.produce(s,1);assert.equal(f.reserve.drone,60);assert.equal(f.reserve.dog,2+level-1);assert.equal(batch.drone,1);assert.equal(f.reserve.siege,0);
    f.base[1].hp=0;assert.ok(Object.values(G.produce(s,1)).every(n=>n===0));
  }
});
test('AI uses identical technology, research and production upgrade prices and budgets',()=>{
  const s=fresh(),f=s.factions[1];assert.equal(G.unlockUnit(s,'siege',1).ok,false);assert.ok(G.upgradeTech(s,1).ok);assert.equal(f.credits,240);assert.equal(f.buildActions,1);
  assert.equal(G.availableUnits(s,1).siege,0);assert.ok(G.unlockUnit(s,'siege',1).ok);assert.equal(f.credits,120);assert.equal(f.reserve.siege,4);assert.equal(f.buildActions,0);
  assert.equal(G.upgradeArmory(s,1).ok,false);G.nextRound(s);const before=f.credits;assert.ok(G.upgradeArmory(s,1).ok);assert.equal(f.credits,before-160);assert.equal(f.armoryLevel,2);
  assert.equal(G.setProduction(s,f.base.find(b=>b.type==='barracks').id,['siege','robot'],1),false);
});
test('deployment deducts inventory, forbids locked types and enforces identical capacity',()=>{
  for(const id of [0,1,2,3]){
    const s=fresh(),e=G.economy(s,id),b=new G.Battle(G.base());e.reserve.siege=10;assert.equal(G.deployFromReserve(s,b,'siege',.5,5,id),null);
    e.reserve.drone=30;for(let i=0;i<G.capacity(s,id);i++)assert.ok(G.deployFromReserve(s,b,'drone',.5,i%10+1,id));
    assert.equal(e.reserve.drone,14);assert.equal(G.deployFromReserve(s,b,'drone',.5,1,id),null);assert.equal(e.reserve.drone,14);
  }
});
test('AI casualties stay consumed, only survivors return, and victory rewards are equal',()=>{
  for(const id of [0,1]){
    const s=fresh(),defender=id===0?1:0,t=s.tiles.find(t=>t.owner===defender&&!t.hq),i=s.tiles.indexOf(t),e=G.economy(s,id);
    const b=G.bindAttack(s,i,new G.Battle(G.targetBase(s,t)));G.deployFromReserve(s,b,'dog',.5,1,id);G.deployFromReserve(s,b,'drone',.5,2,id);
    b.units[0].hp=1;b.units[1].hp=0;b.won=true;const money=e.credits;assert.ok(G.settleAttack(s,i,b,id).ok);
    assert.equal(e.reserve.dog,10);assert.equal(e.reserve.drone,11);assert.equal(e.credits,money+70);assert.deepEqual(s.factions[id].lastBattle,{round:1,sector:G.sectorName(t),deployed:2,returned:1,lost:1});
    const after=JSON.stringify(s);assert.equal(G.settleAttack(s,i,b,id).ok,false);assert.equal(JSON.stringify(s),after);
  }
});
test('an empty AI cannot summon a siege army or launch a core assault',()=>{
  const s=fresh();s.tiles.forEach(t=>{t.owner=-1;t.hq=false;});s.factions[2].alive=s.factions[3].alive=false;
  s.tiles[20].owner=0;s.tiles[20].hq=true;s.tiles[21].owner=1;s.tiles[21].hq=true;
  const f=s.factions[1];for(const k in f.reserve)f.reserve[k]=0;const reports=G.enemyTurn(s);assert.equal(reports.length,0);assert.equal(s.tiles[20].owner,0);assert.equal(G.reserveTotal(s,1),0);
});
test('a real AI report reconciles each unit stock before deployment and after losses',()=>{
  const s=fresh();s.tiles.forEach(t=>{t.owner=-1;t.hq=false;});s.factions[2].alive=s.factions[3].alive=false;
  s.tiles[20].owner=0;s.tiles[20].hq=true;s.tiles[21].owner=1;s.tiles[21].hq=true;
  const r=G.enemyTurn(s)[0];assert.ok(r);assert.equal(r.deployed,r.army.length);assert.equal(r.lost+r.returned,r.deployed);assert.ok(r.deployed<=16);
  const replay=G.simulatedBattle(r.buildings,r.army,r.seed,r.level,r.guards,r.side);assert.equal(replay.survivors,r.returned);assert.equal(replay.won,r.result.won);
  for(const k in G.UNIT){const sent=r.army.filter(t=>t===k).length,returned=replay.battle.units.filter(u=>u.type===k&&u.hp>0).length;assert.equal(r.stockAfter[k],r.stockBefore[k]-sent+returned);}
});
test('enemyTurn cannot repeat construction, attacks, occupation or rewards in one round',()=>{
  const s=fresh();G.enemyTurn(s);const before=JSON.stringify(s);assert.deepEqual(G.enemyTurn(s),[]);assert.equal(JSON.stringify(s),before);
  const l=JSON.parse(before);G.normalizeState(l);const loaded=JSON.stringify(l);assert.deepEqual(G.enemyTurn(l),[]);assert.equal(JSON.stringify(l),loaded);
});
test('enemy outposts get paid construction, bounded layout and two repairs before attack',()=>{
  const s=fresh();s.round=2;const f=s.factions[1];f.credits=1000;s.tiles.filter(t=>t.owner===1&&!t.hq).forEach(t=>t.owner=-1);
  const t=s.tiles[5*9+7];t.owner=1;t.capturedRound=1;s.tiles[4*9+7].owner=0;const bs=G.targetBase(s,t);bs[0].hp=5;bs[1].hp=0;bs[2].hp=12;
  const repairs=G.repairCost(bs[0])+G.repairCost(bs[1]);G.prepareFaction(s,1);assert.equal(bs.length,4);assert.equal(f.credits,1000-120-repairs);assert.equal(f.buildActions,1);assert.equal(f.repairActions,0);
  assert.equal(bs[0].hp,bs[0].maxHp);assert.equal(bs[1].hp,bs[1].maxHp);assert.equal(bs[2].hp,12);assert.ok(f.moves>=0&&f.moves<=3);assert.equal(new Set(bs.map(b=>b.x+','+b.y)).size,bs.length);
});
test('AI outpost caps and captured factories do not bypass the economy',()=>{
  const s=fresh(),f=s.factions[1],t=s.tiles.find(t=>t.owner===1&&!t.hq),i=s.tiles.indexOf(t);f.credits=10000;
  assert.ok(G.construct(s,'cannon',1,1,1,i).ok);assert.ok(G.construct(s,'cannon',2,1,1,i).ok);f.buildActions=2;
  const funds=f.credits;assert.equal(G.construct(s,'cannon',3,1,1,i).ok,false);assert.equal(G.construct(s,'barracks',3,1,1,i).ok,false);assert.equal(f.credits,funds);
  t.base=G.base(2);const beforeIncome=G.income(s,1);const batch=G.produce(s,1);assert.equal(Object.values(batch).reduce((a,b)=>a+b,0),4);assert.equal(G.income(s,1),beforeIncome);
});
test('all enemy preparation finishes before the first enemy attack',()=>{
  const s=fresh();s.tiles.forEach(t=>{t.owner=-1;t.hq=false;});s.factions[2].alive=false;
  s.tiles[70].owner=0;s.tiles[70].hq=true;s.tiles[11].owner=1;s.tiles[11].hq=true;s.tiles[10].owner=3;s.tiles[10].hq=true;
  const core=s.factions[3].base.find(b=>b.type==='hq');core.hp=1;const r=G.enemyTurn(s).find(r=>r.attacker===1&&r.defender===3);assert.ok(r);assert.equal(r.buildings.find(b=>b.type==='hq').hp,core.maxHp);
});
test('multi-seed campaigns conserve stocks and never deploy unavailable or over-capacity units',()=>{
  let combats=0;
  for(const seed of [7,101,20261011,90317,811]){
    const s=G.newGame(seed);for(let n=0;n<45&&!s.outcome;n++){
      s.phase=3;const rs=G.enemyTurn(s);combats+=rs.length;
      for(const r of rs){assert.ok(r.deployed<=12+r.level*4);for(const k of r.army){assert.ok(s.factions[r.attacker].unlocked[k]);assert.ok(G.UNIT[k].tech<=r.level);}assert.equal(r.lost+r.returned,r.deployed);}
      for(const f of s.factions){const e=G.economy(s,f.id);assert.ok(e.credits>=0);assert.ok(Object.values(e.reserve).every(n=>Number.isInteger(n)&&n>=0&&n<=60));assert.ok(f.moves>=0&&f.buildActions>=0&&f.repairActions>=0);}
      assert.ok(s.tiles.every(t=>Number.isInteger(t.owner)&&t.owner>=-1&&t.owner<4));G.nextRound(s);
    }
  }assert.ok(combats>10);
});

test('AI defenses are prepared before the player may start the next attack phase',()=>{
  const s=fresh();s.round=2;s.phase=2;const t=s.tiles.find(t=>t.owner===1&&!t.hq);t.capturedRound=1;
  const tower=G.targetBase(s,t)[1];tower.hp=1;assert.ok(G.advancePhase(s));assert.equal(s.phase,3);assert.equal(tower.hp,tower.maxHp);assert.equal(s.enemyPreparedRound,2);
  const before=JSON.stringify(s);assert.equal(G.prepareEnemies(s),false);assert.equal(JSON.stringify(s),before);
  const loaded=JSON.parse(before);G.normalizeState(loaded);assert.equal(G.prepareEnemies(loaded),false);assert.equal(loaded.factions[1].credits,s.factions[1].credits);
});

// v0.5: local equipment reinforcement and safe dismantling.
test('local reinforcement spends one build action, preserves hp ratio and raises tower damage',()=>{
  const s=fresh(),tower=s.factions[0].base.find(b=>b.type==='cannon');
  tower.hp=Math.round(tower.maxHp*.5);
  const beforeMax=tower.maxHp,cost=G.buildingUpgradeCost(tower);
  assert.equal(cost,66);
  assert.ok(G.upgradeBuilding(s,tower.id).ok);
  assert.equal(tower.upgrade,1);
  assert.equal(G.buildingLevel(tower),2);
  assert.equal(tower.maxHp,Math.round(G.BUILDING.cannon.hp*1.28));
  assert.ok(Math.abs(tower.hp/tower.maxHp-.5)<.01);
  assert.equal(s.credits,460-cost);
  assert.equal(s.buildActions,1);
  assert.ok(tower.maxHp>beforeMax);

  const makeBattle=upgrade=>{
    const hq=G.building('hq',6,5),c=G.building('cannon',4,4);
    if(upgrade){c.upgrade=1;c.maxHp=Math.round(G.BUILDING.cannon.hp*1.28);c.hp=c.maxHp;}
    const battle=new G.Battle([hq,c]);battle.deploy('drone',4.5,4,1);battle.committed=true;battle.step(.05);return battle.units[0].hp;
  };
  assert.ok(makeBattle(1)<makeBattle(0));
});

test('local reinforcement rejects non-build phases, core, destroyed facilities, insufficient tech and budget',()=>{
  const s=fresh(),tower=s.factions[0].base.find(b=>b.type==='cannon'),hq=s.factions[0].base.find(b=>b.type==='hq');
  s.phase=1;assert.equal(G.upgradeBuilding(s,tower.id).ok,false);s.phase=0;
  tower.hp=0;assert.equal(G.upgradeBuilding(s,tower.id).ok,false);tower.hp=tower.maxHp;
  assert.equal(G.upgradeBuilding(s,hq.id).ok,false);
  assert.ok(G.upgradeBuilding(s,tower.id).ok);
  s.buildActions=1;s.credits=1000;assert.equal(G.upgradeBuilding(s,tower.id).ok,false);
  s.tech=2;s.factions[0].tech=2;assert.ok(G.upgradeBuilding(s,tower.id).ok);
  s.buildActions=1;s.credits=0;assert.equal(G.upgradeBuilding(s,tower.id).ok,false);
});

test('dismantling returns thirty percent, frees a slot and never removes the core or damaged facility',()=>{
  const s=fresh(),tower=s.factions[0].base.find(b=>b.type==='cannon'),hq=s.factions[0].base.find(b=>b.type==='hq');
  const before=s.credits,length=s.factions[0].base.length;
  assert.ok(G.demolish(s,tower.id).ok);
  assert.equal(s.credits,before+Math.floor(G.BUILDING.cannon.cost*.3));
  assert.equal(s.buildActions,1);assert.equal(s.factions[0].base.length,length-1);
  assert.equal(G.demolish(s,hq.id).ok,false);
  const other=s.factions[0].base.find(b=>b.type==='cannon');other.hp=0;s.buildActions=1;
  assert.equal(G.demolish(s,other.id).ok,false);
});

test('outpost dismantling restores capacity for a replacement defensive device',()=>{
  const s=fresh(),index=s.tiles.findIndex(t=>t.owner===0&&!t.hq);s.defenseTile=index;
  s.buildActions=2;assert.ok(G.construct(s,'cannon',1,1).ok);assert.ok(G.construct(s,'cannon',2,1).ok);
  const bs=G.defenseBase(s);assert.equal(bs.length,5);const old=bs[3];
  s.buildActions=1;assert.ok(G.demolish(s,old.id).ok);assert.equal(G.defenseBase(s).length,4);
  s.buildActions=1;assert.ok(G.construct(s,'cannon',3,1).ok);assert.equal(G.defenseBase(s).length,5);
  assert.equal(new Set(G.defenseBase(s).map(b=>b.x+','+b.y)).size,5);
});

test('AI local reinforcement obeys the same budget, tech cap and nonnegative credits',()=>{
  const s=fresh(),f=s.factions[1];
  s.round=3;s.tiles.forEach(t=>{t.owner=-1;t.hq=false;t.base=null;});
  s.tiles[0].owner=1;s.tiles[0].hq=true;s.tiles[1].owner=0;s.tiles[1].hq=true;
  f.credits=100;f.buildActions=2;
  const tower=f.base.find(b=>b.type==='cannon');G.prepareFaction(s,1);
  assert.equal(tower.upgrade,1);assert.equal(G.buildingLevel(tower),2);assert.equal(f.buildActions,1);assert.equal(f.credits,34);
  G.prepareFaction(s,1);assert.equal(tower.upgrade,1);assert.ok(f.credits>=0);
  f.credits=0;f.buildActions=2;s.round=5;G.prepareFaction(s,1);assert.equal(tower.upgrade,1);assert.equal(f.credits,0);
});

