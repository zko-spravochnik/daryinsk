'use strict';

const OWNER='zko-spravochnik';
const REPOSITORY='daryinsk';
const BRANCH='main';
const PATH_REKLAMA='reklama.txt';
const PATH_REQUESTS='requests.txt';
const DB_FILES={
  'с. Дарьинское':'baza_darinsk.txt',
  'с. Байконыс':'baza_baikonys.txt',
  'с. Рубежинское':'baza_rubezhinskoe.txt',
  'с. Володарское':'baza_volodarskoe.txt',
  'с. Озерное':'baza_ozernoe.txt'
};
const VILLAGE_CODES={
  'с. Дарьинское':'+771131',
  'с. Рубежинское':'+771130',
  'с. Володарское':'+771133'
};
const VILLAGE_KEYS={
  'с. Дарьинское':'darinsk','с. Байконыс':'baikonys','с. Рубежинское':'rubezhinskoe',
  'с. Володарское':'volodarskoe','с. Озерное':'ozernoe'
};
const TEMPLATE_TITLES=new Set(['баня','мастер','электрик','сантехник']);
const TILE_KEYS=['homeTile1','homeTile2','homeTile3','homeTile4','homeTile5','homeTile6','homeTile7','homeTile8','homeTile9','homeTile10','homeTile11','homeTile12'];
const CATEGORY_MAP={
  'homeTile1':['АВАРИЙНАЯ','МЕДИЦИНА','ПОЛИЦИЯ','АПТЕКИ'],
  'homeTile2':['ТАКСИ'],
  'homeTile3':['ПРОДУКТЫ','ФАСТФУД','КАФЕ','ВЫПЕЧКА'],
  'homeTile4':['ГОССЛУЖБЫ','ШКОЛЫ','НОТАРИУСЫ'],
  'homeTile5':['МАГАЗИНЫ','МЕБЕЛЬ','КОРМА'],
  'homeTile6':['МАСТЕРА','РЕМОНТ','СВАРЩИКИ','ЭЛЕКТРИКИ','ОКНА','ПОТОЛКИ'],
  'homeTile7':['АВТОСЕРВИС'],
  'homeTile8':['СЕПТИКИ','ДОСТАВКА','ГРУЗОПЕРЕВОЗКИ','ДРОВА','СКВАЖИНЫ'],
  'homeTile9':['КРАСОТА'],
  'homeTile10':['БАНИ'],
  'homeTile11':['УСЛУГИ','ИНТЕРНЕТ','КОВРЫ'],
  'homeTile12':['БЛАГОУСТРОЙСТВО','ПТИЦЫ']
};
const SUB_EMOJI={
  'МАГАЗИНЫ':'shops','КАФЕ':'cafe','ВЫПЕЧКА':'bakery','ФАСТФУД':'doner','ТАКСИ':'taxi',
  'АВТОСЕРВИС':'auto','ШИНОМОНТАЖ':'tires','ЭЛЕКТРИКИ':'electric','СВАРЩИКИ':'welding',
  'САНТЕХНИКА':'plumbing','СЕПТИКИ':'septic','ДОСТАВКА':'delivery','КРАСОТА':'beauty',
  'БАНИ':'baths','ИНТЕРНЕТ':'internet','КОВРЫ':'carpets','УСЛУГИ':'moreServices','ПРОЧЕЕ':'other'
};
const state={
  lang:localStorage.getItem('dar_lang')||'ru',
  texts:null, rows:[], grouped:[], allRows:[], allGroups:[],
  currentVillage:localStorage.getItem('dar_village')||'с. Дарьинское',
  currentView:'home', activeTile:null, activeCategory:'ВСЕ', query:'',
  favorites:JSON.parse(localStorage.getItem('dar_favs')||'[]'),
  vip:new Map(), requests:[], dbByVillage:new Map(), dbRawByVillage:new Map(),
  loaded:false, clockTimer:null, onlineHandler:null, tourRunning:false, tourStep:0
};
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const clean=v=>String(v??'').trim();
const digits=v=>clean(v).replace(/\D/g,'');
const norm=v=>clean(v).toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/\s+/g,' ');
const t=k=>(state.texts?.[state.lang]?.[k]??state.texts?.ru?.[k]??k);
const villageKey=v=>VILLAGE_KEYS[v]||'darinsk';
const selectedDbFile=()=>DB_FILES[state.currentVillage]||DB_FILES['с. Дарьинское'];
const rowFavKey=r=>villageKey(r.village)+'|'+String(r.rowId);
const isEmergency=p=>['101','102','103','104','112'].includes(clean(p).replace(/\D/g,''));
const cleanPhone=p=>clean(p).replace(/[\s()\-]/g,'');
const isKzMobile=p=>/^\+?7(?:70[0-8]|74[0-8]|77[0-8]|75\d)\d{7}$/.test(cleanPhone(p));
const isZkoCity=p=>/^\+?7711(?:2\d{1,2}|3\d{1,2})\d{5,6}$/.test(cleanPhone(p)) || /^\+?77113\d{6}$/.test(cleanPhone(p));
const waNumber=p=>{let d=digits(p); if(d.length===10)d='7'+d; return /^7\d{10}$/.test(d)?d:''};
function toast(msg){const x=$('#toast'); if(!x)return; x.textContent=msg; x.classList.add('show'); setTimeout(()=>x.classList.remove('show'),2800)}
function scrollTop(){window.scrollTo(0,0)}
function setLang(l){if(!state.texts)return; state.lang=l==='kz'?'kz':'ru'; localStorage.setItem('dar_lang',state.lang); $$('[data-lang]').forEach(b=>b.classList.toggle('active',b.dataset.lang===state.lang)); render();}

async function loadLanguages(){
  const r=await fetch('languages.json',{cache:'no-store'}); if(!r.ok)throw new Error('languages.json');
  state.texts=await r.json();
}
function parseDatabase(text,village){
  const good=[], bad=[];
  clean(text).replace(/^\uFEFF/,'').split(/\r?\n/).forEach((line,i)=>{
    if(!line.trim()||line.trim().startsWith('#'))return;
    const p=line.split('|').map(clean);
    if(p.length!==12){bad.push({line:i+1,raw:line});return}
    const rowId=Number(p[0]);
    if(!Number.isInteger(rowId)||rowId<1){bad.push({line:i+1,raw:line});return}
    good.push({
      rowId, raw:line, index:i+1, category:p[1].toUpperCase(), title:p[2]||'.', phone:p[3]||'',
      wa:p[4]||'.', schedule:p[5]||'.', status:p[6]||'.', desc:p[7]||'.', village:p[8]||village,
      address:p[9]||'.', social:p[10]||'.', extra:p[11]||'.'
    });
  });
  return {good,bad};
}
function mergeRows(rows){
  const map=new Map();
  rows.forEach(r=>{
    if(r.category==='ЖИТЕЛИ'){map.set(Symbol(),{id:rowFavKey(r),title:r.title,category:r.category,items:[r]});return}
    const titleKey=norm(r.title), catKey=norm(r.category), template=TEMPLATE_TITLES.has(titleKey);
    let key=catKey+'|'+titleKey;
    if(template){
      if(r.address==='.') key+='|ROW|'+r.rowId;
      else key+='|ADDR|'+norm(r.address);
    }
    if(!map.has(key))map.set(key,{id:key,title:r.title,category:r.category,items:[]});
    map.get(key).items.push(r);
  });
  return [...map.values()];
}
function categoryRowsForTile(tileKey){
  const cats=new Set(CATEGORY_MAP[tileKey]||[]);
  return state.rows.filter(r=>cats.has(r.category));
}
function allCategories(rows=state.rows){return [...new Set(rows.map(r=>r.category))].sort((a,b)=>a.localeCompare(b,'ru'))}
function semanticMatch(row,q){
  const qq=norm(q);
  if(!qq)return true;
  const fields=[row.category,row.title,row.phone,row.wa,row.schedule,row.status,row.desc,row.village,row.address,row.social,row.extra];
  if(fields.some(x=>norm(x).includes(qq)))return true;
  if((qq==='трёкино'||qq==='трекино'||qq==='трекино'.replace(/ё/g,'е')) && row.village==='с. Байконыс')return true;
  return false;
}
function vipKey(village,rowId){return villageKey(village)+'|'+rowId}
function parseDate(s){
  const m=clean(s).match(/^(\d{2})\.(\d{2})\.(\d{4})$/); if(!m)return null;
  const d=new Date(Number(m[3]),Number(m[2])-1,Number(m[1])); d.setHours(0,0,0,0); return isNaN(d.getTime())?null:d;
}
function todayStart(){const d=new Date();d.setHours(0,0,0,0);return d}
function vipActive(v){if(v==='max')return true; const d=parseDate(v); return !!d&&todayStart()<=d}
function parseReklama(text){
  const map=new Map();
  clean(text).split(/\r?\n/).forEach(line=>{
    if(!line.trim()||line.trim().startsWith('#'))return;
    const p=line.split('|').map(clean); if(p.length<3)return;
    const k=p[0]+'|'+p[1], expiry=p[2];
    if(vipActive(expiry))map.set(k,expiry);
  });
  return map;
}
async function fetchText(url){
  const r=await fetch(url,{cache:'no-store'}); if(!r.ok)throw new Error('HTTP '+r.status); return r.text()
}
async function loadAllData(){
  state.rows=[];state.allRows=[];state.dbByVillage.clear();state.dbRawByVillage.clear();
  const files=Object.entries(DB_FILES);
  await Promise.all(files.map(async([v,file])=>{
    try{
      const text=await fetchText(file); state.dbRawByVillage.set(v,text);
      const parsed=parseDatabase(text,v); state.dbByVillage.set(v,parsed.good); state.allRows.push(...parsed.good);
    }catch(e){state.dbByVillage.set(v,[]);state.dbRawByVillage.set(v,'')}
  }));
  state.rows=state.dbByVillage.get(state.currentVillage)||[];
  state.grouped=mergeRows(state.rows);
  state.allRows=[...state.allRows];
  state.allGroups=mergeRows(state.allRows);
  await loadVip();
  state.loaded=true; render();
}
async function loadVip(){
  let text='';
  try{text=await fetchText(PATH_REKLAMA)}catch(e){text=localStorage.getItem('dar_reklama_cache')||''}
  if(text)localStorage.setItem('dar_reklama_cache',text);
  state.vip=parseReklama(text);
}
function githubHeaders(){
  const token=localStorage.getItem('dar_github_pat')||'';
  return token?{'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}:null;
}
async function githubGet(path){
  const h=githubHeaders(); if(!h)throw new Error(t('tokenEmpty'));
  const url='https://api.github.com/repos/'+encodeURIComponent(OWNER)+'/'+encodeURIComponent(REPOSITORY)+'/contents/'+path+'?ref='+encodeURIComponent(BRANCH);
  const r=await fetch(url,{headers:h}); if(!r.ok)throw new Error('HTTP '+r.status); return r.json();
}
function b64Encode(text){return btoa(unescape(encodeURIComponent(text)))}
function b64Decode(text){return decodeURIComponent(escape(atob(text.replace(/\n/g,''))))}
async function githubPut(path,text,message,sha){
  const h=githubHeaders(); if(!h)throw new Error(t('tokenEmpty'));
  h['Content-Type']='application/json';
  const body={message,content:b64Encode(text),branch:BRANCH}; if(sha)body.sha=sha;
  const url='https://api.github.com/repos/'+encodeURIComponent(OWNER)+'/'+encodeURIComponent(REPOSITORY)+'/contents/'+path;
  const r=await fetch(url,{method:'PUT',headers:h,body:JSON.stringify(body)});
  if(!r.ok)throw new Error('HTTP '+r.status+' '+await r.text());
  return r.json();
}
async function readGithubFile(path){
  const x=await githubGet(path); return {text:b64Decode(x.content),sha:x.sha}
}
async function writeGithubFile(path,text,message){
  const cur=await readGithubFile(path); return githubPut(path,text,message,cur.sha)
}
function downloadText(filename,text){
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
async function updateReklama(village,rowId,days){
  const code=villageKey(village), now=new Date(); now.setDate(now.getDate()+days);
  const expiry=String(now.getDate()).padStart(2,'0')+'.'+String(now.getMonth()+1).padStart(2,'0')+'.'+now.getFullYear();
  let text=localStorage.getItem('dar_reklama_cache')||'# village_code | row_id | expiry (DD.MM.YYYY or max)\n';
  const lines=text.split(/\r?\n/).filter(Boolean), target=code+' | '+rowId;
  let found=false;
  for(let i=0;i<lines.length;i++){
    const p=lines[i].split('|').map(clean);
    if(p.length>=3&&p[0]===code&&p[1]===String(rowId)){lines[i]=code+' | '+rowId+' | '+expiry;found=true}
  }
  if(!found)lines.push(code+' | '+rowId+' | '+expiry);
  const newText=lines.join('\n')+'\n';
  try{
    await writeGithubFile(PATH_REKLAMA,newText,'VIP '+code+' #'+rowId+' +'+days+' days');
    localStorage.setItem('dar_reklama_cache',newText);state.vip=parseReklama(newText);render();toast(t('vipSaved'));
  }catch(e){downloadText(PATH_REKLAMA,newText);localStorage.setItem('dar_reklama_cache',newText);state.vip=parseReklama(newText);render();toast(t('offlineSaved'))}
}
function requestId(){return 'req-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8)}
function requestRecordFromGraphs(graphs,action='ADD',rowId=null){
  return {requestId:requestId(),status:'PENDING',action,rowId:rowId?Number(rowId):null,village:graphs[8],villageCode:villageKey(graphs[8]),graphs,createdAt:new Date().toISOString()}
}
function readLocalPending(){try{return JSON.parse(localStorage.getItem('dar_pending_requests')||'[]')}catch{return []}}
function saveLocalPending(a){localStorage.setItem('dar_pending_requests',JSON.stringify(a))}
async function queueRequest(req){
  let queue=readLocalPending();queue.push(req);saveLocalPending(queue);
  try{await flushPendingRequests();toast(t('requestSent'))}catch{toast(t('requestQueued'))}
}
async function readRequests(){
  try{const x=await readGithubFile(PATH_REQUESTS);return {text:x.text,sha:x.sha}}
  catch{try{return {text:localStorage.getItem('dar_requests_cache')||'',sha:null}}catch{return {text:'',sha:null}}}
}
function parseRequests(text){
  return clean(text).split(/\r?\n/).filter(Boolean).map(line=>{try{return JSON.parse(line)}catch{return null}}).filter(Boolean).filter(x=>x.status==='PENDING')
}
async function flushPendingRequests(){
  const local=readLocalPending(); if(!local.length)return;
  let remote=await readRequests(); let remoteText=remote.text||'';
  for(const req of local){
    remoteText += JSON.stringify(req)+'\n';
  }
  await writeGithubFile(PATH_REQUESTS,remoteText,'Sync pending requests');
  saveLocalPending([]);localStorage.setItem('dar_requests_cache',remoteText);
}
async function submitGraphs(graphs,action,rowId){
  const req=requestRecordFromGraphs(graphs,action,rowId);await queueRequest(req)
}
function buildGraphs(fd){
  const village=clean(fd.get('village')),category=clean(fd.get('category')).toUpperCase(),name=clean(fd.get('name'));
  let phone=clean(fd.get('phone')), wa='.';
  if(fd.get('phoneMode')==='city'){
    const code=clean(fd.get('cityCode')), local=digits(fd.get('localNumber')).slice(0,5);
    phone=code+local; wa='.';
  }else{phone=normalizeMobile(phone);wa=isKzMobile(phone)?phone:'.'}
  const schedule=buildSchedule(fd);
  return ['0',category,name,phone,wa,schedule,clean(fd.get('status'))||'.',clean(fd.get('desc'))||'.',village,clean(fd.get('address'))||'.',clean(fd.get('social'))||'.','.'];
}
function normalizeMobile(p){
  let d=digits(p); if(d.startsWith('8'))d='7'+d.slice(1); if(d.length===10)d='7'+d; return d.length===11?'+'+d:'';
}
function buildSchedule(fd){
  const mode=fd.get('scheduleMode')||'none'; if(mode==='24/7')return '24/7'; if(mode==='none')return '.';
  const days=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'],parts=[];
  days.forEach((d,i)=>{if((i===5&&fd.get('satOff'))||(i===6&&fd.get('sunOff')))return;const a=clean(fd.get('from_'+i)),b=clean(fd.get('to_'+i));if(a&&b){let s=d+' '+a+'-'+b;if(fd.get('lunch')&&fd.get('lfrom')&&fd.get('lto'))s+=' обед '+fd.get('lfrom')+'-'+fd.get('lto');parts.push(s)}});
  return parts.length?parts.join('; '):'.';
}
function scheduleState(schedule){
  if(schedule==='.')return {kind:'none'};
  if(norm(schedule)==='24/7')return {kind:'open'};
  const now=new Date(),day=now.getDay(),minute=now.getHours()*60+now.getMinutes();
  const dayNames=['Вс','Пн','Вт','Ср','Чт','Пт','Сб'],dn=dayNames[day];
  const re=new RegExp(dn+'\\s+(\\d{2}):(\\d{2})-(\\d{2}):(\\d{2})(?:\\s+обед\\s+(\\d{2}):(\\d{2})-(\\d{2}):(\\d{2}))?','i');
  const m=schedule.match(re); if(!m)return {kind:'closed'};
  const start=+m[1]*60 + +m[2],end=+m[3]*60 + +m[4];
  const lunchStart=m[5]?+m[5]*60 + +m[6]:null,lunchEnd=m[7]?+m[7]*60 + +m[8]:null;
  const inRange=end<start?(minute>=start||minute<end):(minute>=start&&minute<end);
  if(inRange&&lunchStart!==null&&minute>=lunchStart&&minute<lunchEnd)return {kind:'lunch',until:lunchEnd};
  return {kind:inRange?'open':'closed'};
}
function formatMinutes(m){return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0')}
function effectiveWa(r){if(isEmergency(r.phone)||isZkoCity(r.phone))return '';const c=waNumber(r.wa);return c||waNumber(r.phone)}
function contactLine(r){
  const city=isEmergency(r.phone)||isZkoCity(r.phone),wa=effectiveWa(r),ss=scheduleState(r.schedule);
  const disabled=ss.kind==='closed'||ss.kind==='lunch';
  let status='';
  if(r.schedule!=='.'){
    status=ss.kind==='open'?'<div class="meta">'+esc(t('open'))+'</div>':ss.kind==='lunch'?'<div class="meta">'+esc(t('lunch'))+' '+esc(t('until'))+' '+formatMinutes(ss.until)+'</div>':'<div class="meta">'+esc(t('closed'))+'</div>';
  }
  const callClass=disabled?'call v23-fade':'call';
  return '<div class="phone-row"><div class="phone-label">📞 '+esc(r.phone)+(r.status!=='.'?' · '+esc(r.status):'')+'</div></div>'+
    status+
    '<div class="card-actions"><a class="'+callClass+'" href="tel:'+esc(r.phone)+'">📞 '+esc(t('call'))+'</a>'+
    (!city&&wa?'<a class="wa '+(disabled?'v23-fade':'')+'" '+(disabled?'aria-disabled="true"':'target="_blank" rel="noopener"')+' href="https://wa.me/'+wa+'">🟢 '+esc(t('wa'))+'</a>':'')+
    '<button class="secondary" data-copy="'+esc(r.phone)+'">📋 '+esc(t('copy'))+'</button>'+
    '<button class="secondary" data-error="'+esc(r.rowId)+'" data-village="'+esc(r.village)+'">⚠️ '+esc(t('error'))+'</button></div>';
}
function card(group,separator=false){
  const items=group.items||[group], first=items[0], vip=state.vip.get(vipKey(first.village,first.rowId));
  const cls='card v23-card '+(vip?'card-vip':'');
  let html='<article class="'+cls+'" data-card-id="'+esc(group.id)+'">'+(vip?'<span class="v23-vip-crown">👑</span>':'')+
    '<h3>'+esc(first.title)+'</h3>';
  if(first.category==='ЖИТЕЛИ'&&first.status!=='.')html+='<div class="meta">'+esc(first.status)+'</div>';
  if(first.desc!=='.')html+='<div class="desc">'+esc(first.desc)+'</div>';
  html+=items.map(contactLine).join('');
  if(first.schedule==='.')html+='<button class="secondary" style="width:100%;margin-top:8px" data-addtime="'+esc(first.rowId)+'" data-village="'+esc(first.village)+'">● '+esc(t('addSchedule'))+'</button>';
  html+='<div class="meta">ID: '+esc(first.rowId)+'</div><div class="v23-footer">'+esc(t('footerCards'))+'</div></article>';
  return html;
}
function visibleGroups(){
  let source=state.currentView==='residents'?state.rows.filter(r=>r.category==='ЖИТЕЛИ'):state.currentView==='favorites'?state.rows.filter(r=>state.favorites.includes(rowFavKey(r))):state.rows;
  if(state.currentView==='search'){
    const q=norm(state.query);
    if(q)source=state.allRows.filter(r=>semanticMatch(r,q));
    else source=state.allRows;
  }
  if(state.activeTile)source=source.filter(r=>(CATEGORY_MAP[state.activeTile]||[]).includes(r.category));
  if(state.activeCategory!=='ВСЕ')source=source.filter(r=>r.category===state.activeCategory);
  const groups=mergeRows(source);
  if(state.currentView==='residents')groups.sort((a,b)=>a.title.localeCompare(b.title,'ru'));
  if(state.currentView==='search'&&state.query){
    const current=groups.filter(g=>g.items.some(r=>r.village===state.currentVillage));
    const other=groups.filter(g=>!g.items.some(r=>r.village===state.currentVillage));
    return {current,other};
  }
  groups.sort((a,b)=>{
    const av=state.vip.has(vipKey(a.items[0].village,a.items[0].rowId)),bv=state.vip.has(vipKey(b.items[0].village,b.items[0].rowId));
    return Number(bv)-Number(av);
  });
  return {current:groups,other:[]};
}
function renderCards(){
  const box=$('#cards');if(!box)return;
  if(state.currentView==='home'&& !state.activeTile){box.innerHTML='';$('#cardsView').classList.add('hidden');return}
  $('#cardsView').classList.remove('hidden');
  const data=visibleGroups(), parts=[];
  if(!data.current.length&&!data.other.length){box.innerHTML='<div class="card"><h3>'+esc(t('noResults'))+'</h3></div>';return}
  data.current.forEach(g=>parts.push(card(g)));
  if(data.other.length){
    parts.push('<div class="v23-separator">—— 📍 '+esc(t('otherVillages'))+' ——</div>');
    data.other.forEach(g=>parts.push(card(g)));
  }
  box.innerHTML=parts.join('');
  $$('#cards [data-copy]').forEach(b=>b.onclick=async()=>{await navigator.clipboard?.writeText(b.dataset.copy);toast(t('copied'))});
  $$('#cards [data-error]').forEach(b=>b.onclick=()=>openCorrection(Number(b.dataset.error),b.dataset.village));
  $$('#cards [data-addtime]').forEach(b=>b.onclick=()=>openForm({village:b.dataset.village,rowId:Number(b.dataset.addtime),addTime:true}));
}
function renderHome(){
  const home=$('#homeView');if(!home)return;
  if(state.activeTile){
    $('#pages').classList.add('hidden');$('#quick').classList.add('hidden');
    let subs=[...new Set(categoryRowsForTile(state.activeTile).map(r=>r.category))];
    const folder=t(state.activeTile);
    home.innerHTML='<div class="v23-home-folder"><div class="v23-folder-head"><button class="v23-folder-back" id="folderBack">'+esc(t('folderBack'))+'</button><span>'+esc(folder)+'</span></div><div class="v23-substrip"><button class="v23-subchip active" data-sub="ВСЕ">'+esc(t('allSub'))+'</button>'+subs.map(c=>'<button class="v23-subchip" data-sub="'+esc(c)+'">'+esc(SUB_EMOJI[c]?t(SUB_EMOJI[c]):c)+'</button>').join('')+'</div></div>';
    $('#folderBack').onclick=()=>{state.activeTile=null;state.activeCategory='ВСЕ';$('#homeView').innerHTML='<div class="book"><div id="pages" class="pages"></div></div><div id="quick" class="quick"></div>';renderHome();render();scrollTop()};
    $$('#homeView [data-sub]').forEach(b=>b.onclick=()=>{state.activeCategory=b.dataset.sub;$$('[data-sub]').forEach(x=>x.classList.toggle('active',x===b));renderCards();scrollTop()});
    return;
  }
  home.innerHTML='<div class="book"><div id="pages" class="pages"></div></div><div id="quick" class="quick"></div>';
  const cats=TILE_KEYS;
  const pages=[cats.slice(0,6),cats.slice(6,12)];
  $('#pages').innerHTML=pages.map((p,pi)=>'<div class="v23-page">'+p.map(k=>'<button class="tile v23-tile" data-tile="'+k+'">'+esc(t(k))+'</button>').join('')+'</div>').join('');
  $$('#pages [data-tile]').forEach(b=>b.onclick=()=>{state.activeTile=b.dataset.tile;state.activeCategory='ВСЕ';state.currentView='home';renderHome();renderCards();scrollTop()});
  $('#quick').className='v23-quick';
  $('#quick').innerHTML=['recent','popular','important'].map(k=>'<button data-quick="'+k+'">'+esc(t(k))+'</button>').join('');
  $$('#quick [data-quick]').forEach(b=>b.onclick=()=>quickAction(b.dataset.quick));
}
function renderSearchBar(){
  const bar=$('#searchBar'); if(!bar)return;
  const active=['search','residents'].includes(state.currentView);
  bar.innerHTML=active?'<input id="searchInput" type="search" autocomplete="off" placeholder="'+esc(t('searchPlaceholder'))+'"><button class="primary" id="allVillagesBtn">🗺️</button><button class="primary" id="addBtn">➕</button>':'';
  if(active){
    $('#searchInput').value=state.query;
    $('#searchInput').oninput=e=>{state.query=e.target.value;state.currentView=state.currentView==='residents'?'residents':'search';renderCards()};
    $('#allVillagesBtn').onclick=()=>villageModal();
    $('#addBtn').onclick=()=>openForm();
  }
}
function renderNav(){
  $('#bottomNav').innerHTML=[
    ['home','🏠',t('home')],['residents','👥',t('residents')],['search','🔎',t('search')],
    ['favorites','⭐',t('favorites')],['more','⋯',t('more')]
  ].map(x=>'<button data-view="'+x[0]+'" class="'+(state.currentView===x[0]?'active':'')+'">'+x[1]+'<span>'+esc(x[2])+'</span></button>').join('');
  $$('#bottomNav [data-view]').forEach(b=>b.onclick=()=>navigate(b.dataset.view));
}
function renderHeader(){
  $('#brand').textContent=t('brand');$('#villageLabel').textContent=state.currentVillage;
  $$('.lang').forEach(b=>b.classList.toggle('active',b.dataset.lang===state.lang));
}
function render(){
  renderHeader();renderNav();renderSearchBar();renderHome();
  if(state.currentView!=='home' || state.activeTile)renderCards();else renderCards();
  updateClockStatuses();renderFooter();
}
function renderFooter(){let f=$('#appFooter');if(!f){f=document.createElement('div');f.id='appFooter';f.className='v23-footer';$('#app').appendChild(f)}f.textContent=t('footer')}
function navigate(view){
  state.currentView=view;state.query='';state.activeCategory='ВСЕ';if(view==='home')state.activeTile=null;
  if(view==='more'){more();return}
  if(view==='residents')state.query='';
  render();scrollTop();tourObserve(view);
}
function villageModal(){
  showModal('<div class="modal"><h2>'+esc(t('villages'))+'</h2>'+Object.keys(DB_FILES).map(v=>'<button class="primary" style="width:100%;margin:5px 0" data-village="'+esc(v)+'">'+esc(v)+'</button>').join('')+'</div>');
  $$('[data-village]').forEach(b=>b.onclick=()=>{state.currentVillage=b.dataset.village;localStorage.setItem('dar_village',state.currentVillage);state.rows=state.dbByVillage.get(state.currentVillage)||[];state.grouped=mergeRows(state.rows);closeModal();render();scrollTop()});
}
function showModal(html){$('#modalRoot').innerHTML='<div class="modal-backdrop" id="backdrop">'+html+'</div>';$('#backdrop').onclick=e=>{if(e.target.id==='backdrop')closeModal()}}
function closeModal(){$('#modalRoot').innerHTML=''}
function quickAction(k){
  const emergency=state.rows.filter(r=>isEmergency(r.phone)||r.category==='АВАРИЙНАЯ'||r.category==='ПОЛИЦИЯ'||r.category==='МЕДИЦИНА');
  if(k==='important'){state.currentView='search';state.activeTile='homeTile1';state.activeCategory='ВСЕ';renderCards();scrollTop();return}
  if(k==='recent'){const ids=JSON.parse(localStorage.getItem('dar_recent')||'[]');state.currentView='search';state.query='';const g=mergeRows(state.rows.filter(r=>ids.includes(rowFavKey(r))));$('#cards').innerHTML=g.slice(0,5).map(card).join('');$('#cardsView').classList.remove('hidden');scrollTop();return}
  if(k==='popular'){state.currentView='search';state.query='';const g=mergeRows(state.rows).sort((a,b)=>b.items.length-a.items.length).slice(0,10);$('#cards').innerHTML=g.map(card).join('');$('#cardsView').classList.remove('hidden');scrollTop()}
}
function openCorrection(rowId,village){const r=(state.dbByVillage.get(village)||[]).find(x=>x.rowId===rowId);if(r)openForm(r)}
function openForm(prefill={}){
  const r=prefill.rowId?(state.dbByVillage.get(prefill.village)||[]).find(x=>x.rowId===prefill.rowId):null;
  const x=r||prefill;
  const cats=allCategories(state.rows).filter(c=>c!=='ЖИТЕЛИ');
  let html='<div class="modal"><h2>➕ '+esc(t(prefill.addTime?'addSchedule':'add'))+'</h2><form id="v23Form" class="v23-form-grid">'+
  '<select name="category" required><option value="">'+esc(t('category'))+'</option>'+cats.map(c=>'<option '+(x.category===c?'selected':'')+'>'+esc(c)+'</option>').join('')+'</select>'+
  '<input name="name" required value="'+esc(x.title||'')+'" placeholder="'+esc(t('name'))+'">'+
  '<div class="v23-radio-row"><button type="button" class="v23-radio active" id="mobileMode">'+esc(t('mobile'))+'</button><button type="button" class="v23-radio" id="cityMode">'+esc(t('city'))+'</button></div>'+
  '<div id="mobileBox"><input name="phone" inputmode="numeric" value="'+esc(x.phone||'+7')+'" placeholder="+7XXXXXXXXXX"></div>'+
  '<div id="cityBox" class="hidden"><select name="cityCode">'+Object.entries(VILLAGE_CODES).map(([v,c])=>'<option value="'+c+'">'+esc(v)+' '+c+'</option>').join('')+'</select><input name="localNumber" inputmode="numeric" maxlength="5" placeholder="'+esc(t('localNumber'))+'"></div>'+
  '<div><b>'+esc(t('schedule'))+'</b><div class="v23-radio-row"><label class="v23-radio"><input type="radio" name="scheduleMode" value="24/7"> '+esc(t('roundTheClock'))+'</label><label class="v23-radio"><input type="radio" name="scheduleMode" value="none" checked> '+esc(t('noneSchedule'))+'</label><label class="v23-radio"><input type="radio" name="scheduleMode" value="custom"> '+esc(t('custom'))+'</label></div></div>'+
  '<div id="customSchedule" class="hidden"><div class="v23-day-grid">'+['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map((d,i)=>'<div class="v23-day-row"><b>'+d+'</b><select name="from_'+i+'">'+timeOptions()+'</select><select name="to_'+i+'">'+timeOptions()+'</select></div>').join('')+'</div>'+
  '<label><input type="checkbox" name="lunch"> '+esc(t('lunchCheck'))+'</label><div class="v23-radio-row"><select name="lfrom">'+timeOptions()+'</select><select name="lto">'+timeOptions()+'</select></div><label><input type="checkbox" name="satOff" checked> '+esc(t('satOff'))+'</label><label><input type="checkbox" name="sunOff" checked> '+esc(t('sunOff'))+'</label></div>'+
  '<input name="status" value="'+esc(x.status||'')+'" placeholder="'+esc(t('status'))+'"><textarea name="desc" required placeholder="'+esc(t('desc'))+'">'+esc(x.desc&&x.desc!=='.'?x.desc:'')+'</textarea>'+
  '<select name="village" required>'+Object.keys(DB_FILES).map(v=>'<option '+((x.village||state.currentVillage)===v?'selected':'')+'>'+esc(v)+'</option>').join('')+'</select>'+
  '<input name="address" value="'+esc(x.address||'')+'" placeholder="'+esc(t('address'))+'"><input name="social" value="'+esc(x.social||'')+'" placeholder="'+esc(t('social'))+'">'+
  '<button class="primary" id="formSend">'+esc(t('send'))+'</button><button type="button" class="secondary" id="formCancel">'+esc(t('cancel'))+'</button></form></div>';
  showModal(html);
  const f=$('#v23Form'),mobile=$('#mobileMode'),city=$('#cityMode'),mb=$('#mobileBox'),cb=$('#cityBox'),cs=$('#customSchedule');
  mobile.onclick=()=>{mobile.classList.add('active');city.classList.remove('active');mb.classList.remove('hidden');cb.classList.add('hidden')};
  city.onclick=()=>{city.classList.add('active');mobile.classList.remove('active');mb.classList.add('hidden');cb.classList.remove('hidden')};
  $$('input[name=scheduleMode]').forEach(q=>q.onchange=()=>cs.classList.toggle('hidden',q.value!=='custom'||!q.checked));
  $('#formCancel').onclick=closeModal;
  f.onsubmit=e=>{e.preventDefault();const graphs=buildGraphs(new FormData(f));submitGraphs(graphs,r?'UPDATE':'ADD',r?.rowId||null);closeModal()};
  if(prefill.addTime){f.querySelector('input[value="custom"]').checked=true;cs.classList.remove('hidden')}
}
function timeOptions(){let a=[];for(let h=0;h<24;h++)for(let m of [0,30]){let s=String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');a.push('<option>'+s+'</option>')}return a.join('')}
async function syncRequests(){
  try{await flushPendingRequests()}catch{}
  try{const x=await readRequests();state.requests=parseRequests(x.text);localStorage.setItem('dar_requests_cache',x.text)}catch{state.requests=[]}
}
function requestGraphsToText(g){return g.join(' | ')}
async function approveRequest(req){
  const village=req.village, path=DB_FILES[village];if(!path)throw new Error('Village');
  const current=await readGithubFile(path), parsed=parseDatabase(current.text,village), rows=parsed.good;
  let graphs=req.graphs.slice();
  if(req.action==='UPDATE'){
    const idx=rows.findIndex(r=>r.rowId===Number(req.rowId));if(idx<0)throw new Error('ID');
    graphs[0]=String(req.rowId);rows[idx]=parseDatabase(graphs.join(' | '),village).good[0];
  }else{
    const next=rows.reduce((m,r)=>Math.max(m,r.rowId),0)+1;graphs[0]=String(next);rows.push(parseDatabase(graphs.join(' | '),village).good[0]);
  }
  const newText=rows.map(r=>[r.rowId,r.category,r.title,r.phone,r.wa,r.schedule,r.status,r.desc,r.village,r.address,r.social,r.extra].join(' | ')).join('\n')+'\n';
  const result=await githubPut(path,newText,(req.action==='UPDATE'?'Update':'Add')+' request '+req.requestId,current.sha);
  await removeRequestAfterSuccess(req);
  return result;
}
async function removeRequestAfterSuccess(req){
  const x=await readGithubFile(PATH_REQUESTS), lines=x.text.split(/\r?\n/).filter(Boolean);
  const remain=lines.filter(line=>{try{return JSON.parse(line).requestId!==req.requestId}catch{return true}});
  await githubPut(PATH_REQUESTS,remain.length?remain.join('\n')+'\n':'','Approve '+req.requestId,x.sha);
}
async function moderator(){
  await syncRequests();
  const list=state.requests;
  let html='<div class="modal"><h2>🔐 '+esc(t('moderator'))+'</h2><p>'+esc(t('newRequests'))+': <b>'+list.length+'</b></p>';
  if(!list.length)html+='<p>'+esc(t('noResults'))+'</p>';
  list.forEach((r,i)=>{html+='<div class="v23-request"><div><b>'+esc(r.action==='UPDATE'?t('correction'):t('add'))+'</b> · '+esc(r.village)+' · ID '+esc(r.rowId||'NEW')+'</div><div class="v23-status">'+esc(r.createdAt||'')+'</div><p>'+esc(r.graphs.slice(1,10).join(' | '))+'</p><div class="v23-admin-row"><button class="v23-admin-btn primary" data-approve="'+i+'">'+esc(t('approve'))+'</button><button class="v23-admin-btn secondary" data-editreq="'+i+'">'+esc(t('edit'))+'</button></div><button class="v23-admin-btn v23-danger" data-delreq="'+i+'">'+esc(t('delete'))+'</button></div>'});
  html+='<button class="secondary" id="modClose" style="width:100%">'+esc(t('close'))+'</button></div>';showModal(html);
  $$('[data-approve]').forEach(b=>b.onclick=async()=>{try{await approveRequest(list[+b.dataset.approve]);toast(t('approved'));closeModal();await moderator()}catch(e){toast(t('githubFail'))}});
  $$('[data-delreq]').forEach(b=>b.onclick=async()=>{try{await deleteRequest(list[+b.dataset.delreq]);toast(t('requestDeleted'));closeModal();await moderator()}catch{toast(t('githubFail'))}});
  $$('[data-editreq]').forEach(b=>b.onclick=()=>editRequest(list[+b.dataset.editreq]));
  $('#modClose').onclick=closeModal;
}
async function deleteRequest(req){
  const x=await readGithubFile(PATH_REQUESTS), lines=x.text.split(/\r?\n/).filter(Boolean).filter(line=>{try{return JSON.parse(line).requestId!==req.requestId}catch{return true}});
  await githubPut(PATH_REQUESTS,lines.length?lines.join('\n')+'\n':'','Delete request '+req.requestId,x.sha)
}
function editRequest(req){openForm({village:req.village,rowId:req.rowId,category:req.graphs[1],title:req.graphs[2],phone:req.graphs[3],wa:req.graphs[4],schedule:req.graphs[5],status:req.graphs[6],desc:req.graphs[7],address:req.graphs[9],social:req.graphs[10]})}
async function admin(){
  await syncRequests();
  showModal('<div class="modal"><h2>🔐 '+esc(t('admin'))+'</h2><div class="v23-admin-grid">'+
    '<button class="v23-admin-btn v23-gold" id="adVip">👑 '+esc(t('reklama'))+'</button>'+
    '<button class="v23-admin-btn primary" id="adReq">📨 '+esc(t('moderator'))+' ('+state.requests.length+')</button>'+
    '<input class="v23-token" id="patInput" type="password" autocomplete="off" placeholder="'+esc(t('token'))+'">'+
    '<button class="v23-admin-btn secondary" id="savePat">'+esc(t('saveToken'))+'</button><button class="v23-admin-btn v23-danger" id="clearPat">'+esc(t('clearToken'))+'</button>'+
    '<button class="secondary" id="adClose" style="width:100%">'+esc(t('close'))+'</button></div></div>');
  $('#patInput').value=localStorage.getItem('dar_github_pat')||'';
  $('#savePat').onclick=()=>{const v=$('#patInput').value.trim();if(v)localStorage.setItem('dar_github_pat',v);toast(t('tokenSaved'))};
  $('#clearPat').onclick=()=>{localStorage.removeItem('dar_github_pat');$('#patInput').value=''};
  $('#adVip').onclick=vipMonitor;$('#adReq').onclick=moderator;$('#adClose').onclick=closeModal;
}
function vipMonitor(){
  showModal('<div class="modal"><h2>👑 '+esc(t('reklama'))+'</h2><select id="vipVillage" style="width:100%;padding:12px;border-radius:12px;border:1px solid var(--line)">'+Object.keys(DB_FILES).map(v=>'<option>'+esc(v)+'</option>').join('')+'</select><input id="vipId" inputmode="numeric" style="width:100%;padding:12px;margin-top:8px;border-radius:12px;border:1px solid var(--line)" placeholder="'+esc(t('rowId'))+'"><div class="v23-admin-row" style="margin-top:8px"><button class="v23-admin-btn v23-gold" id="vip7">'+esc(t('plus7'))+'</button><button class="v23-admin-btn v23-gold" id="vip14">'+esc(t('plus14'))+'</button></div><button class="v23-admin-btn v23-gold" id="vip30" style="margin-top:7px">'+esc(t('plus30'))+'</button><button class="secondary" id="vipClose" style="width:100%;margin-top:8px">'+esc(t('close'))+'</button></div>');
  const go=d=>{const v=$('#vipVillage').value,id=Number($('#vipId').value);if(!id)return toast(t('rowId'));const r=(state.dbByVillage.get(v)||[]).find(x=>x.rowId===id);if(!r)return toast('ID '+id);updateReklama(v,id,d)};
  $('#vip7').onclick=()=>go(7);$('#vip14').onclick=()=>go(14);$('#vip30').onclick=()=>go(30);$('#vipClose').onclick=closeModal;
}
function about(){showModal('<div class="modal"><h2>ℹ️ '+esc(t('about'))+'</h2><p>'+esc(t('aboutText'))+'</p><p>'+esc(t('footer'))+'</p><button class="primary" id="aboutClose" style="width:100%">'+esc(t('close'))+'</button></div>');$('#aboutClose').onclick=closeModal}
function more(){
  showModal('<div class="modal"><h2>⋯ '+esc(t('more'))+'</h2><button class="primary" style="width:100%;margin:5px 0" id="mAdd">➕ '+esc(t('add'))+'</button><button class="primary" style="width:100%;margin:5px 0" id="mAbout">ℹ️ '+esc(t('about'))+'</button><button class="primary" style="width:100%;margin:5px 0" id="mAdmin">🔐 '+esc(t('admin'))+'</button><p class="v23-footer">'+esc(t('footer'))+'</p></div>');
  $('#mAdd').onclick=()=>openForm();$('#mAbout').onclick=about;$('#mAdmin').onclick=admin;
}
function startTour(){
  if(localStorage.getItem('dar_tour_done')||state.tourRunning)return;
  state.tourRunning=true;state.tourStep=0;tourStep();
}
function tourStep(){
  const steps=[
    {target:'#themeBtn',text:'tour1',next:true},
    {target:'[data-view="residents"]',text:'tour3',require:'residents'},
    {target:'[data-view="search"]',text:'tour4',require:'search'},
    {target:'[data-view="favorites"]',text:'tour5',require:'favorites'},
    {target:'[data-view="more"]',text:'tour6',require:'more'},
    {target:'#mAdd',text:'tour7',require:'form'}
  ];
  if(state.tourStep>=steps.length){finishTour();return}
  const s=steps[state.tourStep],target=document.querySelector(s.target);
  if(!target){state.tourStep++;tourStep();return}
  $$('.tour-highlight').forEach(x=>x.classList.remove('tour-highlight'));target.classList.add('tour-highlight');
  $('#tourBubble')?.remove();
  const b=document.createElement('div');b.id='tourBubble';b.className='bubble';b.innerHTML='<p>'+esc(t(s.text))+'</p><div class="bubble-actions"><button class="tour-skip">'+esc(t('skip'))+'</button>'+ (s.next?'<button class="tour-next">'+esc(t('next'))+'</button>':'')+'</div>';document.body.appendChild(b);
  const r=target.getBoundingClientRect();b.style.left=Math.max(15,Math.min(innerWidth-b.offsetWidth-15,r.left+r.width/2-b.offsetWidth/2))+'px';b.style.top=Math.min(innerHeight-b.offsetHeight-15,Math.max(15,r.bottom+12))+'px';
  b.querySelector('.tour-skip').onclick=finishTour;
  if(s.next)b.querySelector('.tour-next').onclick=()=>{state.tourStep++;tourStep()};
  if(s.require){
    const expected=s.require;
    const handler=()=>{if((expected==='form'&&$('#v23Form'))||(expected===state.currentView)||(expected==='more'&&$('#mAdd'))){document.removeEventListener('click',handler,true);setTimeout(()=>{state.tourStep++;tourStep()},200)}};
    document.addEventListener('click',handler,true);
  }
}
function tourObserve(view){if(!state.tourRunning)return;if(view==='residents'||view==='search'||view==='favorites')setTimeout(tourStep,250)}
function finishTour(){state.tourRunning=false;localStorage.setItem('dar_tour_done','1');$$('.tour-highlight').forEach(x=>x.classList.remove('tour-highlight'));$('#tourBubble')?.remove();closeModal()}
function scheduleTicker(){clearInterval(state.clockTimer);state.clockTimer=setInterval(()=>updateClockStatuses(),60000)}
function updateClockStatuses(){if($('#cards')&&state.currentView!=='home')renderCards()}
function initAdminHold(){
  let timer=null;
  $('#infoBtn').onpointerdown=()=>{timer=setTimeout(()=>{const code=prompt(t('adminCode'));if(code==='1411')admin()},3000)};
  ['pointerup','pointercancel','pointerleave'].forEach(e=>$('#infoBtn').addEventListener(e,()=>clearTimeout(timer)));
  $('#infoBtn').onclick=about;
}
async function init(){
  try{await loadLanguages()}catch(e){document.body.innerHTML='<main style="padding:30px">languages.json</main>';return}
  $('#themeBtn').textContent=localStorage.getItem('dar_theme')==='dark'?'☀️':'🌙';
  $('#themeBtn').onclick=()=>{document.body.classList.toggle('dark');localStorage.setItem('dar_theme',document.body.classList.contains('dark')?'dark':'light');$('#themeBtn').textContent=document.body.classList.contains('dark')?'☀️':'🌙'};
  $$('[data-lang]').forEach(b=>b.onclick=()=>setLang(b.dataset.lang));initAdminHold();
  window.addEventListener('online',async()=>{await flushPendingRequests();await loadAllData()});
  render();await loadAllData();scheduleTicker();
  if('serviceWorker' in navigator)navigator.serviceWorker.register('service-worker.js').catch(()=>{});
  setTimeout(()=>$('#splash')?.classList.add('hidden'),1000);
  if(!localStorage.getItem('dar_greeted')){showModal('<div class="modal"><h2>'+esc(t('appName'))+'</h2><p>'+esc(t('aboutText'))+'</p><div class="langs" style="justify-content:center"><button class="lang active" data-g="ru">РУССКИЙ</button><button class="lang" data-g="kz">ҚАЗАҚША</button></div><button class="primary" id="gEnter" style="width:100%;margin-top:10px">'+esc(t('close'))+'</button></div>');let gl=state.lang;$$('[data-g]').forEach(b=>b.onclick=()=>{gl=b.dataset.g;$$('[data-g]').forEach(x=>x.classList.toggle('active',x===b));});$('#gEnter').onclick=()=>{state.lang=gl;localStorage.setItem('dar_lang',gl);localStorage.setItem('dar_greeted','1');closeModal();startTour()}}
  else if(!localStorage.getItem('dar_tour_done'))setTimeout(startTour,300);
}
init();
