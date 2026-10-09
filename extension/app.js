/* Beacon Web 1.0.0 - browser-direct Xtream client */
/* global Hls */
'use strict';

const $ = s => document.querySelector(s);
const els = {
  login: $('#loginView'), app: $('#appView'), content: $('#content'), loading: $('#loading'), search: $('#search'),
  player: $('#playerModal'), video: $('#video'), banner: $('#connectionBanner')
};
const state = {
  view:'home', account:null, auth:null, liveCategories:[], movieCategories:[], seriesCategories:[],
  live:[], movies:[], series:[], selectedCategory:'all', query:'', page:0, pageSize:60,
  hls:null, currentPlayback:null, currentSeries:null, currentEpisodes:[], guideCache:new Map(),
  prefs:{favorites:[],recent:[],hiddenLiveCategories:[],hiddenMovieCategories:[],hiddenSeriesCategories:[]}, history:[]
};

const safe = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normServer = value => String(value||'').trim().replace(/\/+$/,'');
const displayTitle = item => item?.name || item?.title || 'Untitled';
const accountId = () => state.account ? btoa(unescape(encodeURIComponent(`${state.account.server}\n${state.account.username}`))).replace(/[^a-z0-9]/gi,'').slice(0,40) : 'none';
const prefKey = () => `beacon:web:prefs:${accountId()}`;
const histKey = () => `beacon:web:history:${accountId()}`;
const itemId = (kind,item) => `${kind}:${kind==='series' ? item.series_id : item.stream_id}`;
const kindId = (kind,item) => String(kind==='episode' ? item.id : kind==='series' ? item.series_id : item.stream_id);

function toast(message){const e=$('#toast');e.textContent=message;e.classList.remove('hidden');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.add('hidden'),2800)}
function setLoading(on){els.loading.classList.toggle('hidden',!on);els.content.classList.toggle('hidden',on)}
function clock(){ $('#clock').textContent=new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}); }
function browserError(err){
  const msg=String(err?.message||err||'Connection failed');
  if(/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
    return 'Beacon could not contact that IPTV server. Check the server address and port, confirm the VPN extension is connected, and make sure Chrome is allowed to reach the provider.';
  }
  return msg.replace(/^Error:\s*/,'');
}
function showBanner(text,type='info'){els.banner.textContent=text;els.banner.className=`connection-banner ${type}`;els.banner.classList.remove('hidden')}
function hideBanner(){els.banner.classList.add('hidden')}

function saveAccount(account,remember){
  const payload=JSON.stringify(account);
  if(remember){localStorage.setItem('beacon:web:account',payload);sessionStorage.removeItem('beacon:web:account')}
  else{sessionStorage.setItem('beacon:web:account',payload);localStorage.removeItem('beacon:web:account')}
  localStorage.setItem('beacon:web:remember',remember?'1':'0');
}
function loadAccount(){
  const raw=sessionStorage.getItem('beacon:web:account')||localStorage.getItem('beacon:web:account');
  if(!raw)return null;try{return JSON.parse(raw)}catch{return null}
}
function loadLocalData(){
  try{state.prefs={...state.prefs,...JSON.parse(localStorage.getItem(prefKey())||'{}')}}catch{}
  try{state.history=JSON.parse(localStorage.getItem(histKey())||'[]');if(!Array.isArray(state.history))state.history=[]}catch{state.history=[]}
}
function savePrefs(){localStorage.setItem(prefKey(),JSON.stringify(state.prefs))}
function saveHistory(){localStorage.setItem(histKey(),JSON.stringify(state.history.slice(0,500)))}

function buildApiUrl(action='',params={}){
  const a=state.account;if(!a)throw new Error('No account is connected.');
  const u=new URL(`${a.server}/player_api.php`);
  u.searchParams.set('username',a.username);u.searchParams.set('password',a.password);
  if(action)u.searchParams.set('action',action);
  Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,String(v)));
  return u;
}
async function api(action='',params={},timeoutMs=20000){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const r=await fetch(buildApiUrl(action,params),{signal:controller.signal,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
    if(!r.ok)throw new Error(`Provider returned HTTP ${r.status}`);
    return await r.json();
  }catch(e){if(e.name==='AbortError')throw new Error('The provider took too long to respond.');throw e}finally{clearTimeout(timer)}
}
function mediaUrl(kind,item){
  const a=state.account,u=encodeURIComponent(a.username),p=encodeURIComponent(a.password);
  if(kind==='live')return `${a.server}/live/${u}/${p}/${item.stream_id}.m3u8`;
  const ext=String(item.container_extension||'mp4').replace(/[^a-z0-9]/gi,'')||'mp4';
  if(kind==='movie')return `${a.server}/movie/${u}/${p}/${item.stream_id}.${ext}`;
  if(kind==='episode')return `${a.server}/series/${u}/${p}/${item.id}.${ext}`;
  throw new Error('Unknown media type');
}

async function connect(account,remember){
  state.account={server:normServer(account.server),username:String(account.username||'').trim(),password:String(account.password||'')};
  if(!/^https?:\/\//i.test(state.account.server))throw new Error('Server URL must begin with http:// or https://');
  if(!state.account.username||!state.account.password)throw new Error('Username and password are required.');
  const result=await api();
  if(String(result?.user_info?.auth)!=='1')throw new Error('The provider rejected that login.');
  state.auth=result;saveAccount(state.account,remember);loadLocalData();
}

function showLogin(){els.app.classList.add('hidden');els.login.classList.remove('hidden')}
function showApp(){els.login.classList.add('hidden');els.app.classList.remove('hidden');clock();setInterval(clock,30000);$('#accountLabel').textContent=`${state.account.username} • ${state.account.server}`;$('#rememberSetting').checked=localStorage.getItem('beacon:web:remember')==='1'}

async function init(){
  const saved=loadAccount();$('#remember').checked=localStorage.getItem('beacon:web:remember')==='1';
  if(!saved)return showLogin();
  $('#server').value=saved.server||'';$('#username').value=saved.username||'';$('#password').value=saved.password||'';
  try{setLoading(true);await connect(saved,$('#remember').checked);showApp();await loadShell()}catch(e){showLogin();$('#loginError').textContent=browserError(e)}finally{setLoading(false)}
}

$('#loginForm').addEventListener('submit',async e=>{
  e.preventDefault();const b=e.submitter;b.disabled=true;b.textContent='Connecting…';$('#loginError').textContent='';
  try{await connect({server:$('#server').value,username:$('#username').value,password:$('#password').value},$('#remember').checked);showApp();await loadShell()}
  catch(err){$('#loginError').textContent=browserError(err)}finally{b.disabled=false;b.textContent='Connect'}
});

async function loadShell(force=false){
  setLoading(true);hideBanner();
  try{
    if(force)Object.assign(state,{liveCategories:[],movieCategories:[],seriesCategories:[],live:[],movies:[],series:[],guideCache:new Map()});
    const lc=await api('get_live_categories'); const mc=[]; const sc=[];
    state.liveCategories=Array.isArray(lc)?lc:[];state.movieCategories=Array.isArray(mc)?mc:[];state.seriesCategories=Array.isArray(sc)?sc:[];
    await renderView(state.view);
  }catch(e){els.content.innerHTML=`<div class="empty"><h3>Couldn’t load your service</h3><p>${safe(browserError(e))}</p></div>`;showBanner(browserError(e),'warn')}
  finally{setLoading(false)}
}
async function ensure(kind){
  const map={live:['live','get_live_streams'],movies:['movies','get_vod_streams'],series:['series','get_series']};const [key,action]=map[kind];
  if(!state[key].length){const x=await api(action,{},40000);state[key]=Array.isArray(x)?x:[]}
  return state[key];
}

const names={home:['WELCOME BACK','Home'],live:['WATCH NOW','Live TV'],guide:['WHAT’S ON','Program Guide'],movies:['ON DEMAND','Movies'],series:['BINGE-WORTHY','TV Series'],favorites:['YOUR PICKS','Favorites'],history:['PICK UP WHERE YOU LEFT OFF','Watch History']};
async function renderView(view){
  state.view=view;state.selectedCategory='all';state.page=0;state.query='';els.search.value='';
  document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  const n=names[view]||['BEACON',''];$('#viewEyebrow').textContent=n[0];$('#viewTitle').textContent=n[1];setLoading(true);
  try{
    if(view==='home')await renderHome();else if(view==='live')await renderMedia('live');else if(view==='guide')await renderGuide();else if(view==='movies')await renderMedia('movies');else if(view==='series')await renderMedia('series');else if(view==='favorites')await renderFavorites();else if(view==='history')renderHistory();
  }catch(e){els.content.innerHTML=`<div class="empty"><h3>Couldn’t load this section</h3><p>${safe(browserError(e))}</p></div>`}
  finally{setLoading(false)}
}

function hiddenCats(kind){const k={live:'hiddenLiveCategories',movies:'hiddenMovieCategories',series:'hiddenSeriesCategories'}[kind];return new Set((state.prefs[k]||[]).map(String))}
function categories(kind){const arr=kind==='live'?state.liveCategories:kind==='movies'?state.movieCategories:state.seriesCategories;const hidden=hiddenCats(kind);return arr.filter(c=>!hidden.has(String(c.category_id)))}
function filtered(items,kind){const hidden=hiddenCats(kind);return items.filter(i=>!hidden.has(String(i.category_id))&&(state.selectedCategory==='all'||String(i.category_id)===String(state.selectedCategory))&&(!state.query||displayTitle(i).toLowerCase().includes(state.query)))}
function catButtons(kind){return `<button class="${state.selectedCategory==='all'?'active':''}" data-cat="all">All</button>${categories(kind).map(c=>`<button class="${String(state.selectedCategory)===String(c.category_id)?'active':''}" data-cat="${safe(c.category_id)}">${safe(c.category_name)}</button>`).join('')}`}
function pageItems(items){const pages=Math.max(1,Math.ceil(items.length/state.pageSize));state.page=Math.min(state.page,pages-1);return items.slice(state.page*state.pageSize,(state.page+1)*state.pageSize)}
function pager(total){const pages=Math.max(1,Math.ceil(total/state.pageSize));if(pages<=1)return'';return `<div class="pagination"><button data-page="${state.page-1}" ${state.page===0?'disabled':''}>← Previous</button><span>Page ${state.page+1} of ${pages}</span><button data-page="${state.page+1}" ${state.page>=pages-1?'disabled':''}>Next →</button></div>`}
function fav(kind,item){return state.prefs.favorites.includes(itemId(kind,item))}
function imageFor(item){return item?.stream_icon||item?.cover||item?.movie_image||item?.info?.movie_image||''}
function recordFor(kind,id){return state.history.find(r=>r.key===`${kind}:${id}`)}
function progressBar(r){return r&&r.duration>0?`<div class="watch-progress"><i style="width:${Math.max(0,Math.min(100,r.position/r.duration*100))}%"></i></div>`:''}

function card(item,kind){
  const id=kindId(kind,item),r=(kind==='movie'||kind==='episode')?recordFor(kind,id):null,img=imageFor(item),title=displayTitle(item);
  return `<article class="card" data-open-kind="${kind}" data-open-id="${safe(id)}"><div class="poster">${img?`<img src="${safe(img)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:`<div class="fallback">▶</div>`}${progressBar(r)}</div><div class="card-title">${safe(title)}</div><div class="card-sub">${safe(item.releaseDate||item.year||item.genre||'')}</div><div class="card-actions"><button data-play-kind="${kind}" data-play-id="${safe(id)}">${r&&r.position>30?'Resume':'Play'}</button><button class="star ${fav(kind==='movie'?'movies':kind,item)?'active':''}" data-fav-kind="${kind==='movie'?'movies':kind}" data-fav-id="${safe(id)}">★</button></div></article>`
}
function rowCard(item,kind){
  const id=kindId(kind,item),r=(kind==='movie'||kind==='episode')?recordFor(kind,id):null,img=imageFor(item);
  return `<article class="row-card" data-open-kind="${kind}" data-open-id="${safe(id)}"><div class="row-card-image">${img?`<img src="${safe(img)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:`<div class="fallback">▶</div>`}${progressBar(r)}</div><div class="row-card-title">${safe(displayTitle(item))}</div><div class="row-card-sub">${safe(item.seriesName||item.genre||'')}</div></article>`
}

async function renderHome(){
  const live=await ensure('live'),movies=[],series=[];
  const cw=state.history.filter(r=>!r.completed&&r.position>=30).slice(0,12);
  const recentLive=state.prefs.recent.map(id=>live.find(x=>String(x.stream_id)===String(id))).filter(Boolean).slice(0,10);
  const hero=(cw[0]||movies[0]||series[0]);
  const heroTitle=hero?.title||hero?.name||hero?.seriesName||'Beacon';const heroImage=hero?.image||imageFor(hero)||'';
  const continueHtml=cw.length?`<section class="row-section"><div class="row-header"><h3>Continue Watching</h3><button class="link-button" data-go="history">View all</button></div><div class="row-scroll">${cw.map(historyRowCard).join('')}</div></section>`:'';
  els.content.innerHTML=`<section class="hero-banner" ${heroImage?`style="background-image:url('${safe(heroImage)}')"`:''}><div class="hero-content"><p class="eyebrow">BEACON WEB</p><h2>${safe(heroTitle)}</h2><p class="muted">Your provider, your guide, your history — directly in the browser.</p><div class="hero-actions"><button class="primary" data-go="live">Watch Live TV</button><button id="homeMediaHub" type="button">Browse Cloud Movies & Series</button></div></div></section><div class="stat-grid"><div class="stat"><span class="muted">Live channels</span><strong>${live.length.toLocaleString()}</strong></div><div class="stat"><span class="muted">Movies</span><strong>${movies.length.toLocaleString()}</strong></div><div class="stat"><span class="muted">Series</span><strong>${series.length.toLocaleString()}</strong></div></div>${continueHtml}${recentLive.length?`<section class="row-section"><div class="row-header"><h3>Recently Watched Live TV</h3></div><div class="row-scroll">${recentLive.map(x=>rowCard(x,'live')).join('')}</div></section>`:''}`;
}
async function renderMedia(kind){const all=filtered(await ensure(kind),kind),rows=pageItems(all);els.content.innerHTML=`<div class="category-row">${catButtons(kind)}</div><div class="grid">${rows.map(x=>card(x,kind==='movies'?'movie':kind)).join('')}</div>${pager(all.length)}`}

async function guideFor(item){
  const key=String(item.stream_id);if(state.guideCache.has(key))return state.guideCache.get(key);
  try{const d=await api('get_short_epg',{stream_id:item.stream_id,limit:2},12000);const listings=(d?.epg_listings||[]).map(x=>({title:decode64(x.title)||'Program',start:x.start,end:x.end,description:decode64(x.description)}));state.guideCache.set(key,listings);return listings}catch{state.guideCache.set(key,[]);return[]}
}
function decode64(v){try{return decodeURIComponent(escape(atob(v||'')))}catch{return v||''}}
async function renderGuide(){
  const all=filtered(await ensure('live'),'live'),rows=pageItems(all);els.content.innerHTML=`<div class="category-row">${catButtons('live')}</div><div class="channel-list">${rows.map(x=>`<div class="channel-row" data-play-kind="live" data-play-id="${safe(x.stream_id)}"><img src="${safe(x.stream_icon||'')}" alt=""><b>${safe(x.name)}</b><div class="guide-program" id="guide-${safe(x.stream_id)}"><span class="muted">Loading guide…</span></div><button class="star ${fav('live',x)?'active':''}" data-fav-kind="live" data-fav-id="${safe(x.stream_id)}">★</button></div>`).join('')}</div>${pager(all.length)}`;
  rows.forEach(async x=>{const target=$(`#guide-${CSS.escape(String(x.stream_id))}`);if(!target)return;const g=await guideFor(x);if(!target.isConnected)return;target.innerHTML=g.length?`<b>${safe(g[0].title)}</b><small>${safe(g[0].start||'')}</small>${g[1]?`<div class="guide-next"><small>UP NEXT</small><span>${safe(g[1].title)}</span></div>`:''}`:'<span class="muted">Guide unavailable</span>'});
}

async function renderFavorites(){
  const [live,movies,series]=await Promise.all([ensure('live'),ensure('movies'),ensure('series')]);const sets={live:new Map(live.map(x=>[String(x.stream_id),x])),movies:new Map(movies.map(x=>[String(x.stream_id),x])),series:new Map(series.map(x=>[String(x.series_id),x]))};
  const rows=state.prefs.favorites.map(k=>{const [kind,id]=k.split(':');const item=sets[kind]?.get(id);return item?{kind,item}:null}).filter(Boolean);
  els.content.innerHTML=rows.length?`<div class="grid">${rows.map(({kind,item})=>card(item,kind==='movies'?'movie':kind)).join('')}</div>`:'<div class="empty"><h3>No favorites yet</h3><p>Use ★ to add channels, movies, or series.</p></div>';
}
function historyRowCard(r){return `<article class="row-card" data-history-key="${safe(r.key)}"><div class="row-card-image">${r.image?`<img src="${safe(r.image)}" alt="" loading="lazy">`:`<div class="fallback">▶</div>`}${progressBar(r)}</div><div class="row-card-title">${safe(r.title)}</div><div class="row-card-sub">${safe(r.seriesName?`${r.seriesName}${r.season?` • S${r.season}E${r.episodeNum||''}`:''}`:(r.completed?'Watched':'Resume'))}</div></article>`}
function renderHistory(){
  const rows=[...state.history].sort((a,b)=>b.updatedAt-a.updatedAt);els.content.innerHTML=rows.length?`<div class="row-scroll history-scroll">${rows.map(historyRowCard).join('')}</div>`:'<div class="empty"><h3>No watch history yet</h3><p>Movies and episodes you start in Beacon Web will appear here.</p></div>';
}

function findItem(kind,id){
  if(kind==='live')return state.live.find(x=>String(x.stream_id)===String(id));if(kind==='movie')return state.movies.find(x=>String(x.stream_id)===String(id));if(kind==='series')return state.series.find(x=>String(x.series_id)===String(id));if(kind==='episode')return state.currentEpisodes.find(x=>String(x.id)===String(id));return null;
}
function upsertHistory(meta,position,duration,completed=false){
  if(!meta||!['movie','episode'].includes(meta.kind))return;const key=`${meta.kind}:${meta.id}`,now=Date.now();const existing=state.history.find(x=>x.key===key)||{};const done=completed||(duration>=60&&position/duration>=.94);const rec={...existing,...meta,key,position:done&&duration?duration:Math.max(0,position||0),duration:Math.max(0,duration||0),completed:done,updatedAt:now,startedAt:existing.startedAt||now};state.history=[rec,...state.history.filter(x=>x.key!==key)].slice(0,500);saveHistory();return rec;
}
function resumeFor(meta){const r=recordFor(meta.kind,meta.id);if(!r||r.completed||r.position<30)return 0;if(r.duration&&((r.duration-r.position)<120||r.position/r.duration>=.94))return 0;return Math.floor(r.position)}

async function play(kind,item,metaOverride=null){
  if(!item)return toast('That item could not be found.');if(kind==='series')return showSeries(item);
  if(kind==='live'){state.prefs.recent=[String(item.stream_id),...state.prefs.recent.filter(x=>String(x)!==String(item.stream_id))].slice(0,50);savePrefs()}
  const meta=metaOverride||(kind==='movie'?{kind:'movie',id:String(item.stream_id),title:displayTitle(item),image:imageFor(item),containerExtension:item.container_extension||'mp4'}:kind==='episode'?{kind:'episode',id:String(item.id),title:displayTitle(item),seriesName:item.seriesName||state.currentSeries?.name||'',seriesId:item.seriesId||state.currentSeries?.series_id||null,season:item.season,episodeNum:item.episode_num||item.episodeNum,image:imageFor(item),containerExtension:item.container_extension||'mp4'}:null);
  const resume=meta?resumeFor(meta):0;if(meta)upsertHistory(meta,resume,recordFor(meta.kind,meta.id)?.duration||0,false);
  await openPlayer(kind,item,meta,resume);
}
async function openPlayer(kind,item,meta,resume){
  state.hls?.destroy();state.hls=null;state.currentPlayback=meta?{meta,lastSaved:0}:null;$('#playerKind').textContent=kind==='live'?'LIVE TV':kind==='movie'?'MOVIE':'TV EPISODE';$('#playerTitle').textContent=displayTitle(item);$('#playerDescription').textContent=kind==='episode'?[meta?.seriesName,meta?.season?`Season ${meta.season}`:'',meta?.episodeNum?`Episode ${meta.episodeNum}`:''].filter(Boolean).join(' • '):'';$('#playerError').textContent='';els.player.classList.remove('hidden');
  const url=mediaUrl(kind,item);els.video.pause();els.video.removeAttribute('src');els.video.load();
  if(url.includes('.m3u8')&&window.Hls?.isSupported()){
    const h=new Hls({enableWorker:true,lowLatencyMode:false,maxBufferLength:30});state.hls=h;h.loadSource(url);h.attachMedia(els.video);h.on(Hls.Events.MANIFEST_PARSED,()=>{if(resume>0)try{els.video.currentTime=resume}catch{};els.video.play().catch(e=>$('#playerError').textContent=browserError(e))});h.on(Hls.Events.ERROR,(_e,d)=>{if(d.fatal)$('#playerError').textContent='Browser playback failed. The provider may block browser CORS requests or use a format Chrome cannot decode.'});
  }else{
    els.video.src=url;els.video.addEventListener('loadedmetadata',()=>{if(resume>0)try{els.video.currentTime=Math.min(resume,Math.max(0,els.video.duration-1))}catch{};els.video.play().catch(()=>$('#playerError').textContent='Chrome could not play this stream. It may use an unsupported codec or the provider may block browser playback.')},{once:true});
  }
}
async function closePlayer(){saveCurrent(true);state.hls?.destroy();state.hls=null;state.currentPlayback=null;els.video.pause();els.video.removeAttribute('src');els.video.load();els.player.classList.add('hidden')}
function saveCurrent(force=false,completed=false){const c=state.currentPlayback;if(!c)return;const now=Date.now();if(!force&&now-c.lastSaved<8000)return;c.lastSaved=now;const pos=Number(els.video.currentTime||0),dur=Number.isFinite(els.video.duration)?Number(els.video.duration||0):0;upsertHistory(c.meta,pos,dur,completed)}
els.video.addEventListener('timeupdate',()=>saveCurrent(false,false));els.video.addEventListener('ended',()=>saveCurrent(true,true));

async function showSeries(series){
  setLoading(true);try{const d=await api('get_series_info',{series_id:series.series_id},30000);state.currentSeries=series;state.currentEpisodes=[];const seasons=d?.episodes||{};for(const [season,eps] of Object.entries(seasons)){for(const ep of eps||[])state.currentEpisodes.push({...ep,season,seriesName:series.name,seriesId:series.series_id,image:ep.info?.movie_image||ep.info?.cover_big||series.cover||''})}
    state.view='series-detail';$('#viewEyebrow').textContent='TV SERIES';$('#viewTitle').textContent=series.name||'Series';els.content.innerHTML=`<button class="link-button" data-go="series">← Back to Series</button>${Object.entries(seasons).sort(([a],[b])=>a.localeCompare(b,undefined,{numeric:true})).map(([season,eps])=>`<div class="section-head"><h3>Season ${safe(season)}</h3></div><div class="channel-list">${(eps||[]).map(ep=>{const r=recordFor('episode',ep.id);return `<div class="channel-row episode-row"><div class="episode-number">${safe(ep.episode_num||'')}</div><div class="episode-title"><b>${safe(ep.title||`Episode ${ep.episode_num}`)}</b><small class="muted">${r?.completed?'Watched':r?.position>=30?`Resume at ${formatTime(r.position)}`:''}</small></div><div class="episode-plot">${safe(ep.info?.plot||'')}</div><button data-play-kind="episode" data-play-id="${safe(ep.id)}">${r?.position>=30&&!r.completed?'Resume':'Play'}</button></div>`}).join('')}</div>`).join('')||'<div class="empty">No episodes returned.</div>'}`;
  }catch(e){toast(browserError(e))}finally{setLoading(false)}
}
function formatTime(s){s=Math.max(0,Math.floor(Number(s)||0));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`}
async function playHistory(key){const r=state.history.find(x=>x.key===key);if(!r)return;if(r.kind==='movie'){await ensure('movies');const item=findItem('movie',r.id)||{stream_id:r.id,name:r.title,container_extension:r.containerExtension||'mp4',stream_icon:r.image};return play('movie',item,{...r})}if(r.kind==='episode'){const item={id:r.id,title:r.title,container_extension:r.containerExtension||'mp4',seriesName:r.seriesName,seriesId:r.seriesId,season:r.season,episodeNum:r.episodeNum,image:r.image};return play('episode',item,{...r})}}

$('#nav').addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(b)renderView(b.dataset.view)});
els.content.addEventListener('click',async e=>{
  const go=e.target.closest('[data-go]');if(go)return renderView(go.dataset.go);
  const cat=e.target.closest('[data-cat]');if(cat){state.selectedCategory=cat.dataset.cat;state.page=0;return state.view==='guide'?renderGuide():renderMedia(state.view)}
  const pg=e.target.closest('[data-page]');if(pg&&!pg.disabled){state.page=Number(pg.dataset.page)||0;return state.view==='guide'?renderGuide():renderMedia(state.view)}
  const f=e.target.closest('[data-fav-kind]');if(f){e.stopPropagation();const kind=f.dataset.favKind,id=f.dataset.favId,key=`${kind}:${id}`;state.prefs.favorites=state.prefs.favorites.includes(key)?state.prefs.favorites.filter(x=>x!==key):[key,...state.prefs.favorites];savePrefs();toast(state.prefs.favorites.includes(key)?'Added to Favorites':'Removed from Favorites');return renderView(state.view)}
  const h=e.target.closest('[data-history-key]');if(h)return playHistory(h.dataset.historyKey);
  const p=e.target.closest('[data-play-kind]');if(p){const kind=p.dataset.playKind,id=p.dataset.playId;return play(kind,findItem(kind,id))}
  const o=e.target.closest('[data-open-kind]');if(o){const kind=o.dataset.openKind,id=o.dataset.openId;return play(kind,findItem(kind,id))}
});
els.search.addEventListener('input',()=>{state.query=els.search.value.trim().toLowerCase();state.page=0;if(['live','movies','series'].includes(state.view))renderMedia(state.view);else if(state.view==='guide')renderGuide()});

$('#closePlayer').addEventListener('click',closePlayer);$('#settingsBtn').addEventListener('click',()=>{$('#settingsModal').classList.remove('hidden');$('#accountLabel').textContent=`${state.account.username} • ${state.account.server}`});$('#closeSettings').addEventListener('click',()=>$('#settingsModal').classList.add('hidden'));
$('#rememberSetting').addEventListener('change',e=>saveAccount(state.account,e.target.checked));
$('#refreshAll').addEventListener('click',async()=>{await loadShell(true);toast('Provider data refreshed')});
$('#clearRecent').addEventListener('click',()=>{state.prefs.recent=[];savePrefs();toast('Recently watched live TV cleared')});
$('#clearWatchHistory').addEventListener('click',()=>{state.history=[];saveHistory();toast('Watch history cleared');if(state.view==='history')renderHistory()});
$('#signOut').addEventListener('click',()=>{localStorage.removeItem('beacon:web:account');sessionStorage.removeItem('beacon:web:account');state.account=null;location.reload()});

window.addEventListener('beforeunload',()=>saveCurrent(true,false));
init();
