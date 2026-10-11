/* Shared, deterministic game rules. Runs in browsers and Node without dependencies. */
(function (root) {
  'use strict';
  const SIZE = 12, MAP_SIZE = 9, TICK = .05;
  const FACTIONS = [
    { id: 0, name: '曙光协议', short: 'AURORA', color: '#c9ef78' },
    { id: 1, name: '赫利俄斯', short: 'HELIOS', color: '#ef987c' },
    { id: 2, name: '深蓝矩阵', short: 'DEEPBLUE', color: '#80b7e6' },
    { id: 3, name: '紫晶网络', short: 'AMETHYST', color: '#b9a0e6' }
  ];
  const UNIT = {
    drone: { name: '蜂群无人机', short: '无人机', hp: 32, damage: 8, speed: 1.5, range: 2.1, period: .85, tech: 1, cost: 0, glyph: '◇', role: '远程 · 越过设施' },
    dog: { name: '猎隼机器狗', short: '机器狗', hp: 58, damage: 11, speed: 1.7, range: .85, period: .62, tech: 1, cost: 0, glyph: '⋈', role: '近战 · 优先防御塔' },
    robot: { name: '重装机器人', short: '机器人', hp: 120, damage: 19, speed: .85, range: 1.25, period: 1, tech: 2, cost: 100, glyph: '▣', role: '坦克 · 吸收火力' },
    siege: { name: '磁轨攻城车', short: '攻城车', hp: 100, damage: 38, speed: .65, range: 3.4, period: 1.9, tech: 2, cost: 120, glyph: '▰', role: '远程 · 优先核心' },
    jammer: { name: '信息干扰队', short: '干扰队', hp: 65, damage: 5, speed: 1, range: 2.6, period: 1, tech: 3, cost: 130, glyph: '⌁', role: '支援 · 压制附近防御' }
  };
  const BUILDING = {
    hq: { name: '协议核心', hp: 620, cost: 0, tech: 1, role: '被摧毁后阵营出局' },
    cannon: { name: '磁轨加农炮', hp: 175, damage: 22, range: 3.8, period: 1.15, cost: 120, tech: 1, role: '高单发伤害 · 射程 3.8 格' },
    laser: { name: '脉冲激光塔', hp: 130, damage: 10, range: 4.4, period: .46, cost: 150, tech: 2, role: '快速清除轻型单位 · 射程 4.4 格' },
    shield: { name: '信息屏蔽器', hp: 180, cost: 150, tech: 2, role: '2.8 格内设施减伤 25%，干扰可失效' },
    barracks: { name: '自动化兵营', hp: 160, cost: 160, tech: 1, role: '选择最多两类兵种 · 每回合生产' },
    reactor: { name: '算力反应堆', hp: 130, cost: 100, tech: 1, role: '每回合额外产出 25 算力' }
  };
  const DOCTRINES = [
    { name: '蜂群饱和', weights: { drone: .75, dog: .25 }, hint: '轻型单位分散火力，远程围攻' },
    { name: '猎犬突击', weights: { dog: .7, drone: .3 }, hint: '机器狗迅速摧毁防御塔' },
    { name: '重甲推进', weights: { robot: .6, drone: .4 }, hint: '重装单位吸收伤害，无人机跟进' },
    { name: '磁轨破城', weights: { siege: .45, robot: .35, drone: .2 }, hint: '攻城车优先核心，重装掩护' },
    { name: '电子压制', weights: { jammer: .2, robot: .35, drone: .45 }, hint: '信息干扰降低防御射速并瓦解屏蔽' },
    { name: '均衡协同', weights: { drone: .3, dog: .25, robot: .25, siege: .2 }, hint: '多兵种协同，应对混合防御' }
  ];
  const LAYOUTS = [
    { name: '环形拱卫', slots: [[4,4],[7,4],[4,7],[7,7],[5,3],[8,6],[3,6],[6,8],[3,3],[8,8],[2,5],[9,7]] },
    { name: '紧凑堡垒', slots: [[5,4],[7,5],[5,6],[6,7],[4,5],[7,6],[4,7],[7,3],[3,4],[8,7],[3,6],[8,4]] },
    { name: '外沿拦截', slots: [[3,3],[8,3],[3,8],[8,8],[5,2],[9,5],[2,6],[6,9],[3,5],[8,6],[2,8],[9,2]] }
  ];
  const SPELLS = {
    signal: { name: '信号弹', cost: 1, duration: 9, hint: '9 秒内引导单位靠近并攻击目标' },
    jam: { name: '屏蔽弹', cost: 2, duration: 7, hint: '7 秒降低范围内塔射速，瓦解信息屏蔽' },
    boost: { name: '强化弹', cost: 2, duration: 7, hint: '7 秒内附近单位攻击伤害 +50%' },
    bomb: { name: '战略轰炸', cost: 3, duration: 1.2, hint: '范围伤害 125 / 160 / 195，随科技提高' }
  };
  const dist = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
  const clone = obj => JSON.parse(JSON.stringify(obj));
  const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
  function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15,1 | seed); t ^= t + Math.imul(t ^ t >>> 7,61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  let serial=0;
  function syncBuildingIds(state) {
    const all=[...state.factions.flatMap(f=>f.base),...state.tiles.flatMap(t=>t.base||[])];
    for(const b of all){const n=/^b(\d+)$/.exec(b.id);if(n&&Number.isSafeInteger(+n[1]))serial=Math.max(serial,+n[1]);}
  }
  function buildingLevel(b){return Math.max(1,(b.level||1)+(b.upgrade||0));}
  function buildingMaxHp(type,level=1,upgrade=0){return Math.round(BUILDING[type].hp*(1+(Math.max(1,level+upgrade)-1)*.28));}
  function buildingUpgradeCost(b){return Math.ceil(BUILDING[b.type].cost*(.55+(b.upgrade||0)*.25));}
  function buildingUpgradeLimit(state,id=0){return Math.min(3,economy(state,id).tech+1);}
  function refreshBuilding(b,preserve=true){
    const ratio=b.maxHp>0?b.hp/b.maxHp:1;
    b.upgrade=Number.isInteger(b.upgrade)?Math.max(0,b.upgrade):0;
    b.maxHp=buildingMaxHp(b.type,b.level||1,b.upgrade);
    b.hp=preserve?Math.max(0,Math.min(b.maxHp,Math.round(b.maxHp*ratio))):b.maxHp;
    return b;
  }
  function building(type,x,y,level=1) {
    const maxHp = buildingMaxHp(type,level,0);
    return { id: 'b'+(++serial), type,x,y,level,upgrade:0,hp:maxHp,maxHp,cd:0,production:type==='barracks'?['drone','dog']:null };
  }
  function applyLayout(buildings,index,limit=Infinity) {
    if(!LAYOUTS[index]||limit<=0)return 0;
    const jobs=buildings.filter(b=>b.type!=='hq').map((b,i)=>({b,p:LAYOUTS[index].slots[i]})).filter(j=>j.p);
    const at=(x,y)=>buildings.some(b=>b.x===x&&b.y===y);
    let moves=0;
    // One empty-cell move per action; use a temporary cell to break swap cycles.
    while(moves<limit){
      const pending=jobs.filter(({b,p})=>b.x!==p[0]||b.y!==p[1]);if(!pending.length)break;
      const free=pending.find(({p})=>!at(...p));
      if(free){[free.b.x,free.b.y]=free.p;moves++;continue;}
      const staging=[];
      for(let x=1;x<=10;x++)for(let y=1;y<=10;y++)if(!at(x,y)&&!jobs.some(({p})=>p[0]===x&&p[1]===y))staging.push([x,y]);
      if(!staging.length)break;
      [pending[0].b.x,pending[0].b.y]=staging[0];moves++;
    }
    return moves;
  }
  function base(level=1,variant=0) {
    const arr=[building('hq',6,5,level),building('cannon',4,4,level),building('cannon',7,7,level),building('barracks',4,7,level),building('reactor',7,3,level)];
    if(level>=2)arr.push(building('laser',8,5,level),building('shield',5,6,level));
    if(variant)applyLayout(arr,variant%3);
    return arr;
  }
  function newGame(seed=Date.now()) {
    const random=rng(seed),tiles=[];
    for(let y=0;y<9;y++)for(let x=0;x<9;x++)tiles.push({x,y,owner:-1,hq:false,rich:random()>.74,base:null});
    const factions=FACTIONS.map(f=>({...f,alive:true,tech:1,credits:460,armoryLevel:1,
      reserve:{drone:12,dog:10,robot:0,siege:0,jammer:0},
      unlocked:{drone:true,dog:true,robot:false,siege:false,jammer:false},
      buildActions:2,moves:3,repairActions:2,base:base(1,f.id%3)}));
    const homes=[[1,6],[7,6],[6,1],[1,1]];
    homes.forEach(([x,y],id)=>{for(const t of tiles)if(Math.abs(t.x-x)+Math.abs(t.y-y)<=1)t.owner=id;tiles[y*9+x].hq=true;});
    return { version:2,rulesVersion:5,seed,round:1,phase:0,credits:460,tech:1,energy:5,moves:3,buildActions:2,repairActions:2,armoryLevel:1,
      unlocked:{drone:true,dog:true,robot:false,siege:false,jammer:false},factions,tiles,
      reserve:{drone:12,dog:10,robot:0,siege:0,jammer:0},target:null,
      log:[{round:1,text:'曙光协议上线。先构建，再布局；从周边无人区开始扩张。',kind:'system'}],outcome:null };
  }
  function normalizeState(state){
    let seq=0;for(const e of [...state.log].reverse()){e.seq=Math.max(seq+1,e.seq||0);seq=e.seq;}
    state.logSerial=Math.max(seq,state.logSerial||0);
    for(const t of state.tiles){t.revision=t.revision||0;for(const b of (t.base||[])){if(!Number.isInteger(b.upgrade))b.upgrade=0;if(!Number.isInteger(b.level))b.level=1;if(!Number.isFinite(b.maxHp))refreshBuilding(b,false);}}
    for(const f of state.factions){for(const b of (f.base||[])){if(!Number.isInteger(b.upgrade))b.upgrade=0;if(!Number.isInteger(b.level))b.level=1;if(!Number.isFinite(b.maxHp))refreshBuilding(b,false);}}
    if(!Number.isInteger(state.defenseTile)||state.tiles[state.defenseTile]?.owner!==0)state.defenseTile=null;
    // v0.3 opponents had no inventory. Initialize once, never refill on reload.
    for(const f of state.factions.slice(1)){
      if(!f.reserve)f.reserve={drone:12,dog:10,robot:0,siege:0,jammer:0};
      if(!f.unlocked)f.unlocked={drone:true,dog:true,robot:false,siege:false,jammer:false};
      f.armoryLevel=f.armoryLevel||1;
      for(const k of Object.keys(UNIT)){f.reserve[k]=Math.max(0,Math.min(60,Math.floor(f.reserve[k]||0)));f.unlocked[k]=!!f.unlocked[k];}
      for(const [k,n] of [['buildActions',2],['moves',3],['repairActions',2]])if(!Number.isInteger(f[k]))f[k]=n;
    }
    state.rulesVersion=5;syncBuildingIds(state);return state;
  }
  function log(state,text,kind='system',detail={}){
    if(!Number.isInteger(state.logSerial))normalizeState(state);
    state.log.unshift({round:state.round,seq:++state.logSerial,text,kind,...detail});state.log=state.log.slice(0,35);
  }
  const sectorName=t=>String.fromCharCode(65+t.x)+(t.y+1);
  function defenseTile(state){const t=state.tiles[state.defenseTile];return Number.isInteger(state.defenseTile)&&t?.owner===0?t:state.tiles.find(t=>t.owner===0&&t.hq);}
  function defenseBase(state){const t=defenseTile(state);return t?targetBase(state,t):state.factions[0].base;}
  function factionBuildings(state,id){return [...state.factions[id].base,...state.tiles.filter(t=>t.owner===id&&!t.hq&&t.base).flatMap(t=>t.base)];}
  function changeOwner(tile,id){tile.owner=id;tile.revision=(tile.revision||0)+1;if(id<0)delete tile.capturedRound;}
  function isProtected(state,tile){return !!tile&&tile.owner>=0&&tile.capturedRound===state.round;}
  function actionTargets(state,id=0){return borderTargets(state,id).filter(t=>!isProtected(state,t));}
  function economy(state,id=0){return id===0?state:state.factions[id];}
  function availableUnits(state,id=0){const e=economy(state,id);return Object.fromEntries(Object.keys(UNIT).map(k=>[k,e.unlocked[k]&&UNIT[k].tech<=e.tech?e.reserve[k]:0]));}
  function reserveTotal(state,id=0){return Object.values(availableUnits(state,id)).reduce((a,b)=>a+b,0);}
  function managedTile(state,id=0,index=null){return id===0?defenseTile(state):Number.isInteger(index)&&state.tiles[index]?.owner===id?state.tiles[index]:state.tiles.find(t=>t.owner===id&&t.hq);}
  function borderTargets(state,id=0) {return state.tiles.filter(t=>t.owner!==id&&state.tiles.some(n=>n.owner===id&&Math.abs(t.x-n.x)+Math.abs(t.y-n.y)===1));}
  function income(state,id=0){return 80+state.tiles.filter(t=>t.owner===id).reduce((s,t)=>s+8+(t.rich?10:0),0)+state.factions[id].base.filter(b=>b.type==='reactor'&&b.hp>0).length*25;}
  function capacity(state,id=0){return 12+economy(state,id).tech*4;}
  function techCost(state){return 160+state.tech*60;}
  function spend(state,cost){if(state.credits<cost)return false;state.credits-=cost;return true;}
  function construct(state,type,x,y,id=0,index=null) {
    const e=economy(state,id),tile=managedTile(state,id,index);
    if(state.outcome||!state.factions[id]?.alive||(id===0&&state.phase!==0)||!e.buildActions)return {ok:false,message:'只能在构建阶段建造，每回合最多两项构建。'};
    const def=BUILDING[type];if(!def||type==='hq'||def.tech>e.tech||!tile)return {ok:false,message:'科技等级不足或区域无效。'};
    if(!Number.isInteger(x)||!Number.isInteger(y)||x<1||x>10||y<1||y>10)return {ok:false,message:'建筑只能放在内侧建设区。'};
    const bs=targetBase(state,tile),regional=!tile.hq;
    if(regional&&!['cannon','laser','shield'].includes(type))return {ok:false,message:'前哨只建防御设施；兵营与反应堆请在核心基地建设。'};
    if(regional&&bs.length>=5)return {ok:false,message:'每个前哨最多 5 座设施，含固定节点。'};
    if(bs.length>=13)return {ok:false,message:'原型基地最多容纳 13 座设施。'};
    if(bs.some(b=>b.x===x&&b.y===y))return {ok:false,message:'该位置已被设施占用。'};
    if(!spend(e,def.cost))return {ok:false,message:'算力不足。'};
    const b=building(type,x,y,e.tech);bs.push(b);e.buildActions--;
    log(state,FACTIONS[id].name+'在 '+sectorName(tile)+' 建造 '+def.name+'，消耗 '+def.cost+' 算力。',id===0?'success':'system');return {ok:true,building:b};
  }
  function upgradeTech(state,id=0){
    const e=economy(state,id);
    if(state.outcome||!state.factions[id]?.alive||(id===0&&state.phase!==0)||!e.buildActions||e.tech>=3)return {ok:false,message:'当前无法升级科技。'};
    const cost=techCost(e);if(!spend(e,cost))return {ok:false,message:'算力不足。'};
    e.tech++;state.factions[id].tech=e.tech;e.buildActions--;
    for(const b of factionBuildings(state,id)){const ratio=b.maxHp>0?b.hp/b.maxHp:1;b.level=e.tech;b.maxHp=buildingMaxHp(b.type,b.level,b.upgrade);b.hp=Math.round(b.maxHp*ratio);}
    log(state,FACTIONS[id].name+'科技提升至 T'+e.tech+'，消耗 '+cost+' 算力；设施同步升级，军备仍需研发。',id===0?'success':'system');return {ok:true};
  }
  function unlockUnit(state,type,id=0){
    const e=economy(state,id),d=UNIT[type];if(state.outcome||!state.factions[id]?.alive||(id===0&&state.phase!==0)||!e.buildActions||!d||d.tech>e.tech||e.unlocked[type])return {ok:false,message:'该兵种尚不可研发或已解锁。'};
    if(!spend(e,d.cost))return {ok:false,message:'算力不足。'};
    e.unlocked[type]=true;e.reserve[type]=Math.min(60,e.reserve[type]+4);e.buildActions--;log(state,FACTIONS[id].name+'解锁 '+d.name+'，消耗 '+d.cost+' 算力，交付 4 台试验机。',id===0?'success':'system');return {ok:true};
  }
  function upgradeArmory(state,id=0){
    const e=economy(state,id);if(state.outcome||!state.factions[id]?.alive||(id===0&&state.phase!==0)||!e.buildActions||e.armoryLevel>=3)return {ok:false,message:'当前无法扩展产线。'};
    if(!spend(e,160))return {ok:false,message:'算力不足。'};
    e.armoryLevel++;e.buildActions--;log(state,FACTIONS[id].name+'产线提升至 L'+e.armoryLevel+'，消耗 160 算力，每个完好兵营生产 '+(4+2*(e.armoryLevel-1))+' 个单位。',id===0?'success':'system');return {ok:true};
  }
  function upgradeBuilding(state,buildingId,id=0,index=null){
    const e=economy(state,id),tile=managedTile(state,id,index);
    if(state.outcome||!state.factions[id]?.alive||(id===0&&state.phase!==0)||!e.buildActions||!tile)return {ok:false,message:'只能在构建阶段强化，每回合共用两项构建。'};
    const b=targetBase(state,tile).find(b=>b.id===buildingId);
    if(!b||b.type==='hq')return {ok:false,message:'协议核心只能通过科技升级，不能单独强化。'};
    if(b.hp<=0)return {ok:false,message:'设施已损毁，请先在维修阶段修复后再强化。'};
    const current=buildingLevel(b),limit=buildingUpgradeLimit(state,id);
    if(current>=limit)return {ok:false,message:'该设施已达到当前科技允许的强化上限。'};
    const cost=buildingUpgradeCost(b);if(!spend(e,cost))return {ok:false,message:'算力不足。'};
    const ratio=b.hp/b.maxHp;b.upgrade=(b.upgrade||0)+1;b.maxHp=buildingMaxHp(b.type,b.level,b.upgrade);b.hp=Math.max(1,Math.round(b.maxHp*ratio));e.buildActions--;
    log(state,FACTIONS[id].name+'强化 '+sectorName(tile)+' 的'+BUILDING[b.type].name+' 至 L'+buildingLevel(b)+'，消耗 '+cost+' 算力。',id===0?'success':'system');
    return {ok:true,building:b,cost};
  }
  function demolish(state,buildingId,id=0,index=null){
    const e=economy(state,id),tile=managedTile(state,id,index);
    if(state.outcome||!state.factions[id]?.alive||(id===0&&state.phase!==0)||!e.buildActions||!tile)return {ok:false,message:'只能在构建阶段拆除，每回合共用两项构建。'};
    const bs=targetBase(state,tile),pos=bs.findIndex(b=>b.id===buildingId),b=pos<0?null:bs[pos];
    if(!b)return {ok:false,message:'设施不存在或不属于当前管理区域。'};
    if(b.type==='hq')return {ok:false,message:'协议核心不可拆除。'};
    if(b.hp<=0)return {ok:false,message:'设施已损毁，请先维修后再拆除。'};
    const refund=Math.floor(BUILDING[b.type].cost*.3);bs.splice(pos,1);e.credits+=refund;e.buildActions--;
    log(state,FACTIONS[id].name+'拆除 '+sectorName(tile)+' 的'+BUILDING[b.type].name+'，返还 '+refund+' 算力。',id===0?'success':'system');
    return {ok:true,refund};
  }
  function moveBuilding(state,id,x,y){
    if(state.outcome||state.phase!==1||state.moves<=0)return {ok:false,message:'只能在布局阶段移动，每回合最多 3 次。'};
    const bs=defenseBase(state),b=bs.find(b=>b.id===id);
    if(!b||b.type==='hq')return {ok:false,message:'协议核心不可移动。'};
    if(x<1||x>10||y<1||y>10||!Number.isInteger(x)||!Number.isInteger(y))return {ok:false,message:'请选建设区内的格子。'};
    if(bs.some(o=>o.x===x&&o.y===y))return {ok:false,message:'该格子已有设施。'};
    b.x=x;b.y=y;state.moves--;return {ok:true};
  }
  function repairCost(b){return Math.ceil((b.maxHp-b.hp)*.16);}
  function repair(state,buildingId,id=0,index=null){
    const e=economy(state,id),tile=managedTile(state,id,index);
    if(state.outcome||!state.factions[id]?.alive||(id===0&&state.phase!==2)||e.repairActions<=0||!tile)return {ok:false,message:'只能在维修阶段操作，最多维修两座设施。'};
    const b=targetBase(state,tile).find(b=>b.id===buildingId);if(!b||b.hp>=b.maxHp||b.type==='hq'&&b.hp<=0)return {ok:false,message:'该设施无需维修或核心已被摧毁。'};
    const cost=repairCost(b);if(!spend(e,cost))return {ok:false,message:'算力不足。'};
    b.hp=b.maxHp;e.repairActions--;log(state,FACTIONS[id].name+'维修 '+sectorName(tile)+' 的'+BUILDING[b.type].name+'，消耗 '+cost+' 算力。',id===0?'success':'system');return {ok:true};
  }
  function setProduction(state,buildingId,types,id=0){
    const e=economy(state,id),b=state.factions[id].base.find(b=>b.id===buildingId);
    if(state.outcome||!state.factions[id]?.alive||(id===0&&state.phase!==0)||!b||b.type!=='barracks')return false;
    if(!types.length||types.length>2||new Set(types).size!==types.length||types.some(t=>!UNIT[t]||!e.unlocked[t]||UNIT[t].tech>e.tech))return false;
    b.production=[...types];return true;
  }
  function produce(state,id=0){
    const e=economy(state,id),batch=Object.fromEntries(Object.keys(UNIT).map(k=>[k,0]));if(!state.factions[id].alive)return batch;
    // Only the main core's barracks produce; captured outpost factories remain inert.
    for(const b of state.factions[id].base)if(b.type==='barracks'&&b.hp>0){
      const choices=[...new Set(b.production||['drone','dog'])].filter(t=>UNIT[t]&&e.unlocked[t]&&UNIT[t].tech<=e.tech).slice(0,2);
      for(let i=0;i<4+2*(e.armoryLevel-1);i++)if(choices.length){const t=choices[i%choices.length];if(e.reserve[t]<60){e.reserve[t]++;batch[t]++;}}
    }return batch;
  }
  function deployFromReserve(state,battle,type,x,y,id=0){
    const e=economy(state,id);
    if(state.outcome||!state.factions[id]?.alive||battle.settled||battle.ended||battle.deployed>=capacity(state,id)||!availableUnits(state,id)[type])return null;
    const unit=battle.deploy(type,x,y,e.tech);if(unit){e.reserve[type]--;battle.committed=true;}return unit;
  }
  function contextOf(buildings) {
    const towers=buildings.filter(b=>b.hp>0&&['cannon','laser'].includes(b.type));
    if(towers.filter(b=>b.type==='laser').length>towers.length/2)return 1;
    if(buildings.some(b=>b.type==='shield'&&b.hp>0))return 2;return 0;
  }
  function planArmy(action,tech,available,count) {
    const result=[],weights=DOCTRINES[action].weights,remaining={...available};
    const choices=Object.keys(UNIT).filter(k=>UNIT[k].tech<=tech&&available[k]>0);
    for(let i=0;i<count;i++) {
      let best=null,score=-Infinity;
      for(const k of choices)if(remaining[k]>0){const n=result.filter(t=>t===k).length,s=(weights[k]||.012)/(n+1);if(s>score){best=k;score=s;}}
      if(!best)break;result.push(best);remaining[best]--;
    }return result;
  }
  class Battle {
    constructor(buildings,seed=1,guards=[]) {
      this.buildings=clone(buildings);this.buildings.forEach(b=>b.cd=0);this.units=[];this.guards=[];this.time=0;this.random=rng(seed);
      this.events=[];this.effects=[];this.ended=false;this.won=false;this.committed=false;this.bombarded=false;this.signal=null;this.buffs=[];
      this.initialHp=this.buildings.reduce((a,b)=>a+b.hp,0);this.deployed=0;this.nextId=1;
      guards.forEach((type,i)=>{const d=UNIT[type],level=buildings.find(b=>b.type==='hq')?.level||1,hp=d.hp*(1+(level-1)*.18);this.guards.push({id:'g'+i,type,x:5+i%3,y:6+Math.floor(i/3),hp,maxHp:hp,level,cd:0,target:null});});
    }
    deploy(type,x,y,level=1){
      if(this.ended||!UNIT[type])return null;
      const d=UNIT[type],hp=d.hp*(1+(level-1)*.18);
      const u={id:this.nextId++,type,x:clamp(x,0,12),y:clamp(y,0,12),hp,maxHp:hp,level,cd:this.random()*.35,target:null};
      this.units.push(u);this.deployed++;return u;
    }
    spell(type,x,y,tech=1){
      if(this.ended||!SPELLS[type])return false;
      if(type==='signal')this.signal={x,y,until:this.time+9};
      if(type==='jam'||type==='boost')this.buffs.push({type,x,y,until:this.time+7});
      if(type==='bomb')this.bombarded=true;
      if(type==='bomb')this.buildings.filter(b=>b.hp>0&&dist(b,{x,y})<2.4).forEach(b=>this.damageBuilding(b,125+(tech-1)*35));
      this.effects.push({type,x,y,life:SPELLS[type].duration});return true;
    }
    isJammed(b){return this.units.some(u=>u.hp>0&&u.type==='jammer'&&dist(u,b)<3)||this.buffs.some(j=>j.type==='jam'&&j.until>this.time&&dist(b,j)<3);}
    damageBuilding(b,damage){
      const shield=this.buildings.some(s=>s.type==='shield'&&s.hp>0&&s.id!==b.id&&!this.isJammed(s)&&dist(s,b)<2.8);
      b.hp=Math.max(0,b.hp-damage*(shield&&!this.isJammed(b)?.75:1));
    }
    move(u,target,dt,obstacles=[]){
      const distance=dist(u,target);if(distance<.001)return;
      let dx=(target.x-u.x)/distance,dy=(target.y-u.y)/distance;
      if(u.type!=='drone')for(const o of obstacles){if(o.id===target.id)continue;const dd=dist(u,o);if(dd<.8&&dd>.01){dx+=(u.x-o.x)/dd*(.8-dd)*2;dy+=(u.y-o.y)/dd*(.8-dd)*2;}}
      const norm=Math.hypot(dx,dy)||1,speed=UNIT[u.type].speed*dt;u.x=clamp(u.x+dx/norm*speed,.02,11.98);u.y=clamp(u.y+dy/norm*speed,.02,11.98);
    }
    step(dt=.08,visual=true){
      if(this.ended)return;
      const initialCore=this.buildings.find(b=>b.type==='hq');
      if(!initialCore||initialCore.hp<=0){this.ended=true;this.won=true;return;}
      if(!this.committed&&!this.deployed&&!this.bombarded)return;
      this.time+=dt;this.effects.forEach(e=>e.life-=dt);this.effects=this.effects.filter(e=>e.life>0);this.buffs=this.buffs.filter(b=>b.until>this.time);
      const live=this.buildings.filter(b=>b.hp>0);
      for(const u of this.units){
        if(u.hp<=0)continue;const d=UNIT[u.type];u.cd-=dt;
        const signal=this.signal&&this.signal.until>this.time?this.signal:null;
        const candidates=live.filter(b=>b.hp>0);
        const guard=this.guards.filter(g=>g.hp>0&&dist(u,g)<3.5).sort((a,b)=>dist(u,a)-dist(u,b))[0];
        const score=t=>dist(u,t)+(u.type==='dog'&&['cannon','laser'].includes(t.type)?-2:0)+(u.type==='siege'&&t.type==='hq'?-5:0)+(signal?dist(t,signal)*2.3:0);
        candidates.sort((a,b)=>score(a)-score(b));
        const target=guard&&u.type!=='siege'&&!signal?guard:candidates[0];if(!target)continue;u.target=target.id;
        if(signal&&dist(u,signal)>1.8&&dist(u,target)>d.range){this.move(u,signal,dt,live);continue;}
        if(dist(u,target)>d.range){this.move(u,target,dt,live);}
        else if(u.cd<=0){
          const boosted=this.buffs.some(b=>b.type==='boost'&&dist(u,b)<3),damage=d.damage*(1+(u.level-1)*.22)*(boosted?1.5:1);
          if(guard===target)target.hp=Math.max(0,target.hp-damage);else this.damageBuilding(target,damage);
          u.cd=d.period;if(visual)this.events.push({type:'shot',from:{x:u.x,y:u.y},to:{x:target.x,y:target.y},color:'#cbef80',life:.18});
        }
      }
      for(const g of this.guards){
        if(g.hp<=0)continue;g.cd-=dt;const d=UNIT[g.type],target=this.units.filter(u=>u.hp>0&&dist(u,g)<5).sort((a,b)=>dist(g,a)-dist(g,b))[0];
        if(!target)continue;if(dist(g,target)>d.range)this.move(g,target,dt);else if(g.cd<=0){target.hp=Math.max(0,target.hp-d.damage*(1+(g.level-1)*.22));g.cd=d.period;if(visual)this.events.push({type:'shot',from:{x:g.x,y:g.y},to:{x:target.x,y:target.y},color:'#ef987c',life:.18});}
      }
      for(const b of this.buildings){
        if(b.hp<=0)continue;const d=BUILDING[b.type];if(!d.damage)continue;b.cd-=dt*(this.isJammed(b)?.4:1);
        if(b.cd<=0){const u=this.units.filter(u=>u.hp>0&&dist(u,b)<=d.range).sort((a,c)=>dist(a,b)-dist(c,b))[0];if(u){u.hp=Math.max(0,u.hp-d.damage*(1+(buildingLevel(b)-1)*.2));b.cd=d.period;if(visual)this.events.push({type:'shot',from:{x:b.x,y:b.y},to:{x:u.x,y:u.y},color:b.type==='laser'?'#f5a4aa':'#ef987c',life:.2});}}
      }
      this.events.forEach(e=>e.life-=dt);this.events=this.events.filter(e=>e.life>0);
      const core=this.buildings.find(b=>b.type==='hq');
      if(!core||core.hp<=0){this.ended=true;this.won=true;}
      else if((this.committed&&this.units.every(u=>u.hp<=0))||this.time>=60){this.ended=true;this.won=false;}
    }
    get destruction(){return Math.min(1,1-this.buildings.reduce((s,b)=>s+b.hp,0)/Math.max(1,this.initialHp));}
  }
  function simulatedBattle(buildings,army,seed=1,level=1,guards=[],side=0,stock=null){
    const b=new Battle(buildings,seed,guards);
    army.forEach((t,i)=>{const along=1.7+(i%9)*1.05;const p=side===0?[.5+(i%2)*.3,along]:side===1?[11.5-(i%2)*.3,along]:side===2?[along,.5+(i%2)*.3]:[along,11.5-(i%2)*.3];if(stock)deployFromReserve(stock.state,b,t,...p,stock.id);else b.deploy(t,...p,level);});
    b.committed=true;while(!b.ended)b.step(TICK,false);return {won:b.won,destruction:b.destruction,survivors:b.units.filter(u=>u.hp>0).length,battle:b};
  }
  function outpost(level=1,variant=0){const bs=[building('hq',6,5,level),building('cannon',4,4,level),building('cannon',7,7,level)];applyLayout(bs,variant%3);return bs;}
  function targetBase(state,tile){
    if(!tile||tile.owner<0)return [];
    if(tile.hq)return state.factions[tile.owner].base;
    if(!tile.base)tile.base=outpost(state.factions[tile.owner]?.tech||1,(tile.x+tile.y*2+tile.owner)%3);
    return tile.base;
  }
  function bindAttack(state,index,battle){const t=state.tiles[index];battle.claim={index,owner:t.owner,revision:t.revision||0,hq:t.hq};return battle;}
  function eliminate(state,id){
    state.factions[id].alive=false;state.tiles.filter(t=>t.owner===id).forEach(t=>{changeOwner(t,-1);t.hq=false;t.base=null;});
    log(state,state.factions[id].name+'核心陷落，剩余领地成为无人区。','attack');
    if(id===0)state.outcome='defeat';else if(state.factions.filter(f=>f.alive).length===1)state.outcome='victory';
  }
  function occupy(state,index,id=0){
    const t=state.tiles[index];if(state.outcome||!state.factions[id]?.alive||!t||t.owner!==-1||!actionTargets(state,id).includes(t))return false;
    if(id===0&&state.phase!==3)return false;
    if(!spend(economy(state,id),40))return false;
    if(id===0)prepareEnemies(state);
    changeOwner(t,id);t.capturedRound=state.round;t.hq=false;t.base=null;log(state,FACTIONS[id].name+'接管 '+sectorName(t)+(t.rich?' 富矿区':' 无人区')+'，归属：无人区 → '+FACTIONS[id].name+'。',id===0?'success':'system',{tile:index,from:-1,to:id});return true;
  }
  function settleAttack(state,index,battle,id=0){
    const t=state.tiles[index],claim=battle.claim;
    if(battle.settled||!t||!state.factions[id]?.alive||t.owner<0||t.owner===id||state.outcome)return {ok:false,message:'战斗已结算或目标已失效。'};
    if(claim&&(claim.index!==index||claim.owner!==t.owner||claim.revision!==(t.revision||0)||claim.hq!==t.hq))return {ok:false,message:'领地已易主，旧战斗不能覆盖新归属。'};
    if(isProtected(state,t))return {ok:false,message:'该区域本回合处于整备保护，下一回合才能进攻。'};
    const defender=t.owner,wasCore=t.hq;battle.settled=true;
    const deployed=Math.max(battle.deployed||0,battle.units.length),returned=battle.units.filter(u=>u.hp>0).length;
    state.factions[id].lastBattle={round:state.round,sector:sectorName(t),deployed,returned,lost:deployed-returned};
    const e=economy(state,id);for(const u of battle.units)if(u.hp>0)e.reserve[u.type]=Math.min(60,e.reserve[u.type]+1);
    if(t.hq)state.factions[defender].base=clone(battle.buildings);else t.base=clone(battle.buildings);
    if(battle.won){
      if(wasCore)eliminate(state,defender);
      changeOwner(t,id);t.capturedRound=state.round;t.hq=false;
      // Keep captured defenses and their actual damage. Reboot only the local node.
      t.base=clone(battle.buildings);const node=t.base.find(b=>b.type==='hq');if(node)node.hp=node.maxHp;
      log(state,FACTIONS[id].name+(id>0&&defender===0?'反攻夺取 ':'攻占 ')+sectorName(t)+'，归属：'+FACTIONS[defender].name+' → '+FACTIONS[id].name+'。'+(wasCore?'阵营核心已击破。':'区域节点已击破。'),id===0?'success':'attack',{tile:index,from:defender,to:id});
      e.credits+=70;
    }else log(state,FACTIONS[id].name+'进攻 '+sectorName(t)+' 受阻，设施损毁 '+Math.round(battle.destruction*100)+'%。归属仍为'+FACTIONS[defender].name+'，损伤保留。','attack',{tile:index,from:defender,to:defender});
    return {ok:true,won:battle.won,from:defender,to:t.owner,index,wasCore};
  }
  function advancePhase(state){if(state.outcome||state.phase>=3)return false;state.phase++;if(state.phase===3)prepareEnemies(state);return true;}
  function prepareFaction(state,id){
    const f=state.factions[id];if(!f.alive||state.outcome)return;
    const own=state.tiles.filter(t=>t.owner===id),hostile=t=>state.tiles.some(n=>n.owner>=0&&n.owner!==id&&Math.abs(n.x-t.x)+Math.abs(n.y-t.y)===1);
    // Prioritize actual front lines and newly acquired outposts. One shared budget.
    const regions=own.filter(hostile).sort((a,b)=>Number(b.hq)-Number(a.hq)||((b.capturedRound||0)-(a.capturedRound||0)));
    const focus=regions[0]||own.find(t=>t.hq),home=own.find(t=>t.hq);
    const add=(type,tile)=>{if(!tile)return false;const bs=targetBase(state,tile),p=LAYOUTS[id%3].slots.find(p=>!bs.some(b=>b.x===p[0]&&b.y===p[1]));return !!p&&construct(state,type,...p,id,state.tiles.indexOf(tile)).ok;};
    if(f.tech<3&&state.round>=f.tech*4)upgradeTech(state,id);
    const research=(id===2?['siege','robot','jammer']:['robot','siege','jammer']).find(k=>UNIT[k].tech<=f.tech&&!f.unlocked[k]);
    if(research)unlockUnit(state,research,id);
    if(home&&!f.base.some(b=>b.type==='barracks'&&b.hp>0)){
      // A destroyed barracks can be repaired below; do not build over its occupied cell.
      if(!f.base.some(b=>b.type==='barracks'))add('barracks',home);
    }
    if(f.armoryLevel<3&&state.round>=f.armoryLevel*4)upgradeArmory(state,id);
    if(state.round>=6&&reserveTotal(state,id)<capacity(state,id)&&f.base.filter(b=>b.type==='barracks').length<3)add('barracks',home);
    if(focus&&(state.round%2===0||focus.capturedRound===state.round-1)){
      const bs=targetBase(state,focus),type=f.tech>=2&&!bs.some(b=>b.type==='shield')?'shield':f.tech>=2?'laser':'cannon';add(type,focus);
    }
    // AI follows the same local reinforcement rule as the player once the campaign has matured.
    if(focus&&state.round>=3&&f.buildActions>0){
      const candidate=targetBase(state,focus).filter(b=>b.type!=='hq'&&b.hp>0&&['cannon','laser','shield'].includes(b.type)&&buildingLevel(b)<buildingUpgradeLimit(state,id)).sort((a,b)=>buildingLevel(a)-buildingLevel(b)||a.hp/a.maxHp-b.hp/b.maxHp)[0];
      if(candidate)upgradeBuilding(state,candidate.id,id,state.tiles.indexOf(focus));
    }
    const choices=Object.keys(UNIT).filter(k=>f.unlocked[k]&&UNIT[k].tech<=f.tech);
    const preferred=choices.filter(k=>['robot','siege','jammer'].includes(k));
    for(const [i,bar] of f.base.filter(b=>b.type==='barracks').entries()){
      const advanced=preferred[(id+i+state.round)%Math.max(1,preferred.length)];
      setProduction(state,bar.id,advanced?[advanced,choices.includes('siege')&&advanced!=='siege'?'siege':'drone']:['drone','dog'],id);
    }
    if(focus&&f.moves>0)f.moves-=applyLayout(targetBase(state,focus),id%3,f.moves);
    const damaged=own.flatMap(t=>targetBase(state,t).map(b=>({t,b}))).filter(({b})=>b.hp<b.maxHp&&!(b.type==='hq'&&b.hp<=0));
    damaged.sort((a,b)=>Number(b.b.type==='hq'&&b.t.hq)-Number(a.b.type==='hq'&&a.t.hq)||Number(b.b.type==='barracks'&&b.b.hp===0)-Number(a.b.type==='barracks'&&a.b.hp===0)||a.b.hp/a.b.maxHp-b.b.hp/b.b.maxHp);
    for(const {t,b} of damaged)if(f.repairActions>0)repair(state,b.id,id,state.tiles.indexOf(t));
  }
  function prepareEnemies(state){
    if(state.outcome||state.enemyPreparedRound===state.round)return false;
    normalizeState(state);state.enemyPreparedRound=state.round;
    for(const f of state.factions.slice(1))prepareFaction(state,f.id);
    return true;
  }
  function enemyTurn(state){
    if(state.outcome||state.enemyTurnRound===state.round)return [];
    normalizeState(state);state.enemyTurnRound=state.round;
    const reports=[],random=rng(state.seed+state.round*1291);
    // Normally prepared at the player's transition into attack; fallback for old saves.
    prepareEnemies(state);
    for(const f of state.factions.slice(1)){
      if(!f.alive||state.outcome)continue;
      const targets=actionTargets(state,f.id),others=state.tiles.filter(t=>t.hq&&t.owner!==f.id&&t.owner>=0);
      const distance=t=>Math.min(...others.map(h=>Math.abs(h.x-t.x)+Math.abs(h.y-t.y)),20);
      targets.sort((a,b)=>(distance(a)-(a.hq?5:0)+(a.owner>=0?.5:0))-(distance(b)-(b.hq?5:0)+(b.owner>=0?.5:0)));
      let target=targets[0];if(!target)continue;
      if(target.owner>=0&&reserveTotal(state,f.id)<Math.min(8,capacity(state,f.id))){
        target=targets.find(t=>t.owner<0);
        if(!target){log(state,f.name+'兵力不足，休整等待兵营补充。');continue;}
      }
      const index=state.tiles.indexOf(target);
      if(target.owner<0){if(!occupy(state,index,f.id))log(state,f.name+'算力不足，暂停扩张。');continue;}
      const defender=target.owner,bs=targetBase(state,target),snapshot=clone(bs),guards=target.hq?['dog','drone']:[];
      const action=(f.id+state.round)%6,army=planArmy(action,f.tech,availableUnits(state,f.id),capacity(state,f.id));
      const seed=Math.floor(random()*1e8),side=f.id%4,stockBefore=clone(f.reserve),result=simulatedBattle(bs,army,seed,f.tech,guards,side,{state,id:f.id});
      bindAttack(state,index,result.battle);const settlement=settleAttack(state,index,result.battle,f.id);
      const deployed=result.battle.deployed,returned=result.survivors;
      const report={attacker:f.id,defender,index,sector:sectorName(target),hq:result.battle.claim.hq,round:state.round,buildings:snapshot,army,seed,level:f.tech,guards,side,
        deployed,returned,lost:deployed-returned,stockBefore,stockAfter:clone(f.reserve),result:{won:result.won,destruction:result.destruction}};
      if(settlement.ok){reports.push(report);f.lastBattle={round:state.round,sector:report.sector,deployed,returned,lost:report.lost};}
    }return reports;
  }
  function nextRound(state){
    if(state.outcome)return;if(state.tiles[state.defenseTile]?.owner!==0)state.defenseTile=null;
    state.round++;state.phase=0;state.moves=3;state.buildActions=2;state.repairActions=2;state.energy=5;state.target=null;
    // Income and production are credited exactly once at the same round boundary.
    for(const f of state.factions)if(f.alive){
      const e=economy(state,f.id),gain=income(state,f.id);e.credits+=gain;e.buildActions=2;e.moves=3;e.repairActions=2;
      const batch=produce(state,f.id);e.lastProduction={round:state.round,units:batch,income:gain};
      if(f.id===0)log(state,'第 '+state.round+' 回合：获得 '+gain+' 算力；完好兵营生产 '+Object.values(batch).reduce((a,b)=>a+b,0)+' 个单位。','success');
    }
  }
  // Contextual epsilon-greedy bandits: learns discrete compositions and layouts,
  // not neural networks or free-form building positions.
  function newAgent(){return {version:2,episodes:0,attackQ:Array.from({length:3},()=>Array(6).fill(0)),attackN:Array.from({length:3},()=>Array(6).fill(0)),defenseQ:Array.from({length:3},()=>Array(3).fill(0)),defenseN:Array.from({length:3},()=>Array(3).fill(0)),history:[],recentWins:[],evaluation:null};}
  function bestAction(q,counts){let best=0,score=-Infinity;q.forEach((v,i)=>{const s=counts[i]?v:.15;if(s>score){score=s;best=i;}});return best;}
  function updateMean(q,n,action,reward){n[action]++;q[action]+=(reward-q[action])/n[action];}
  function trainingScenario(seed){
    const random=rng(seed),context=Math.floor(random()*3),tech=2+Math.floor(random()*2),bs=base(tech);
    if(context===1){bs.filter(b=>b.type==='cannon').forEach(b=>{const n=building('laser',b.x,b.y,tech);Object.assign(b,n);});bs.push(building('laser',3,6,tech));}
    if(context===0)bs.splice(bs.findIndex(b=>b.type==='shield'),1);
    if(random()>.45)bs.push(building(context===1?'laser':'cannon',7,4,tech));
    const guards=['dog','drone'];return {context,tech,buildings:bs,count:8+Math.floor(random()*8),guards,side:Math.floor(random()*4)};
  }
  function trainEpisode(agent,seed){
    const random=rng(seed+777),s=trainingScenario(seed),epsilon=Math.max(.12,.72/(1+agent.episodes/150));
    const q=agent.attackQ[s.context],n=agent.attackN[s.context],action=random()<epsilon?Math.floor(random()*6):bestAction(q,n);
    const available={drone:30,dog:30,robot:30,siege:30,jammer:30},army=planArmy(action,s.tech,available,s.count);
    const result=simulatedBattle(s.buildings,army,seed,s.tech,s.guards,s.side);updateMean(q,n,action,(result.won?1:0)+result.destruction*.5);
    const dc=action===0||action===1?0:action===4?2:1,dq=agent.defenseQ[dc],dn=agent.defenseN[dc];
    const layout=random()<epsilon?Math.floor(random()*3):bestAction(dq,dn),defense=clone(s.buildings);applyLayout(defense,layout);
    const dr=simulatedBattle(defense,army,seed+91,s.tech,s.guards,s.side);updateMean(dq,dn,layout,(dr.won?0:1)+(1-dr.destruction)*.5);
    agent.episodes++;agent.recentWins.push(result.won?1:0);if(agent.recentWins.length>40)agent.recentWins.shift();
    if(agent.episodes%10===0){agent.history.push({episode:agent.episodes,win:agent.recentWins.reduce((a,b)=>a+b,0)/agent.recentWins.length});if(agent.history.length>90)agent.history.shift();}
    return {action,layout,won:result.won};
  }
  function evaluateAgent(agent,count=36){
    const r={count,trainedWins:0,baselineWins:0,trainedDamage:0,baselineDamage:0};
    for(let i=0;i<count;i++){const seed=901001+i*3571,s=trainingScenario(seed),available={drone:30,dog:30,robot:30,siege:30,jammer:30};
      const action=bestAction(agent.attackQ[s.context],agent.attackN[s.context]);
      const a=simulatedBattle(s.buildings,planArmy(action,s.tech,available,s.count),seed,s.tech,s.guards,s.side);
      const b=simulatedBattle(s.buildings,planArmy(5,s.tech,available,s.count),seed,s.tech,s.guards,s.side);
      r.trainedWins+=a.won?1:0;r.baselineWins+=b.won?1:0;r.trainedDamage+=a.destruction;r.baselineDamage+=b.destruction;
    }
    r.trainedDamage/=count;r.baselineDamage/=count;agent.evaluation=r;return r;
  }
  const api={prepareEnemies,isProtected,actionTargets,economy,availableUnits,reserveTotal,produce,deployFromReserve,prepareFaction,normalizeState,sectorName,defenseTile,defenseBase,bindAttack,SIZE,MAP_SIZE,TICK,syncBuildingIds,FACTIONS,UNIT,BUILDING,DOCTRINES,LAYOUTS,SPELLS,dist,clone,rng,building,base,applyLayout,newGame,log,borderTargets,income,capacity,techCost,construct,upgradeTech,unlockUnit,upgradeArmory,upgradeBuilding,buildingLevel,buildingUpgradeCost,buildingUpgradeLimit,demolish,moveBuilding,repairCost,repair,setProduction,contextOf,planArmy,Battle,simulatedBattle,outpost,targetBase,eliminate,occupy,settleAttack,advancePhase,enemyTurn,nextRound,newAgent,bestAction,trainingScenario,trainEpisode,evaluateAgent};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.Sovereign=api;
})(typeof window!=='undefined'?window:globalThis);


