/* Beacon 2.1: Stremio HTTP addon protocol adapter. No arbitrary remote JavaScript. */
'use strict';
(()=>{
 const STORAGE='beacon:stremio:addons:v1';
 const $id=id=>document.getElementById(id);
 const safeUrl=(value)=>{const u=new URL(value);if(u.protocol!=='https:')throw Error('HTTPS is required');if(u.username||u.password)throw Error('Credentials in add-on URLs are unsupported');return u};
 const jget=async url=>{const response=await fetch(url,{signal:AbortSignal.timeout(14000),headers:{Accept:'application/json'}});if(!response.ok)throw Error('HTTP '+response.status);return response.json()};
 let installed=[];try{installed=JSON.parse(localStorage.getItem(STORAGE)||'[]');if(!Array.isArray(installed))installed=[]}catch{installed=[]}
 const persist=()=>localStorage.setItem(STORAGE,JSON.stringify(installed));
 const endpoint=(a,resource,type,id,extra)=>{
   const root=new URL(a.url);const tail=[resource,type,id].map(encodeURIComponent).join('/');
   // Stremio protocol puts extra arguments in a separate path segment.
   const ext=extra?'/' + Object.entries(extra).map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&'):'';
   root.pathname=root.pathname.replace(/manifest\.json$/,'')+tail+ext+'.json';root.search='';return root.href;
 };
 const resourceRule=(a,name)=>a.resources.find(r=>typeof r==='string'?r===name:r?.name===name);
 const hasResource=(a,name)=>!!resourceRule(a,name);
 const supports=(a,name,type,id)=>{
   const rule=resourceRule(a,name);if(!rule||!a.types.includes(type))return false;
   if(typeof rule==='object'&&Array.isArray(rule.types)&&!rule.types.includes(type))return false;
   const prefixes=(typeof rule==='object'&&Array.isArray(rule.idPrefixes)?rule.idPrefixes:a.idPrefixes);
   return !Array.isArray(prefixes)||!prefixes.length||prefixes.some(prefix=>id.startsWith(prefix));
 };
 const message=(value,bad=false)=>{const e=$id('addonSearchStatus');e.textContent=value;e.className=bad?'error':'muted'};
 function renderInstalled(){const target=$id('addonsList');target.replaceChildren();if(!installed.length){const p=document.createElement('p');p.className='muted';p.textContent='No standard add-ons installed.';target.append(p)}
  installed.forEach(a=>{const d=document.createElement('div');d.className='vendorrow';const info=document.createElement('div');const title=document.createElement('strong');title.textContent=a.name;const detail=document.createElement('p');detail.className='muted';detail.textContent=`${a.url} • ${a.catalogs.length} catalog(s) • ${hasResource(a,'stream')?'stream support':'catalog only'}`;info.append(title,detail);const actions=document.createElement('div');actions.className='vendorbuttons';const toggle=document.createElement('button');toggle.textContent=a.enabled?'Enabled ✓':'Disabled';toggle.onclick=()=>{a.enabled=!a.enabled;persist();renderInstalled()};const remove=document.createElement('button');remove.textContent='Remove';remove.onclick=()=>{installed=installed.filter(v=>v.id!==a.id);persist();renderInstalled()};actions.append(toggle,remove);d.append(info,actions);target.append(d)})}
 $id('addAddon').onclick=async()=>{const val=$id('addonUrl').value.trim();try{const u=safeUrl(val);if(!u.pathname.endsWith('/manifest.json'))throw Error('Paste a URL ending in /manifest.json');const manifest=await jget(u.href);if(typeof manifest.id!=='string'||typeof manifest.name!=='string'||!Array.isArray(manifest.resources)||!Array.isArray(manifest.types))throw Error('Not a compatible HTTP add-on manifest');if(installed.some(a=>a.url===u.href))throw Error('Add-on already installed');const catalogs=Array.isArray(manifest.catalogs)?manifest.catalogs.filter(x=>x&&typeof x.id==='string'&&['movie','series'].includes(x.type)).map(x=>({type:x.type,id:x.id,extra:Array.isArray(x.extra)?x.extra:[]})):[];if(!catalogs.length&&!manifest.resources.some(r=>r==='stream'||r?.name==='stream'))throw Error('Add-on must provide a movie/series catalog or stream resource.');const resources=manifest.resources.filter(x=>typeof x==='string'||(x&&typeof x.name==='string'));installed.push({id:crypto.randomUUID(),url:u.href,name:manifest.name,version:String(manifest.version||''),types:manifest.types,resources,catalogs,idPrefixes:Array.isArray(manifest.idPrefixes)?manifest.idPrefixes:[],enabled:true});persist();renderInstalled();notify('Installed '+manifest.name+'. Try searching its catalogs.')}catch(e){notify('Add-on install failed: '+e.message,true)}};
 const button=(label,callback)=>{const b=document.createElement('button');b.textContent=label;b.onclick=callback;return b};
 const normalizeTitle=value=>String(value||'').toLowerCase().replace(/\.[a-z0-9]{2,5}$/,'').replace(/\b(2160p|1080p|720p|480p|bluray|brrip|webrip|web-dl|dvdrip|x264|x265|hevc|h264|aac|dts|hdr|proper|remux|extended)\b/g,' ').replace(/[^a-z0-9]+/g,' ').trim();
 const cloudMatches=(media,type,videoId)=>{
   const files=Array.isArray(library)?library:[];
   const tokens=normalizeTitle(media.name).split(' ').filter(x=>x.length>=2);
   if(!tokens.length)return [];
   const ep=type==='series'?String(videoId||'').match(/:(\d+):(\d+)$/):null;
   return files.filter(file=>{
      const name=normalizeTitle(file.title);
      if(!tokens.every(word=>name.split(' ').includes(word)))return false;
      if(ep){const season=String(Number(ep[1])).padStart(2,'0'),episode=String(Number(ep[2])).padStart(2,'0');
        return new RegExp('s'+season+'\\s*e'+episode+'\\b|'+Number(ep[1])+'x'+episode+'\\b','i').test(String(file.title));}
      return true;
   }).slice(0,60);
 };
 function showCloudMatches(host,media,type,videoId){
   const results=cloudMatches(media,type,videoId);
   const heading=document.createElement('p');heading.className='muted';heading.textContent='Your TorBox / Premiumize library: '+results.length+' matching file(s)';host.append(heading);
   for(const file of results){const tile=document.createElement('div');tile.className='tile';const title=document.createElement('strong');title.textContent=file.title;const desc=document.createElement('p');desc.className='muted';desc.textContent='Already available · '+file.source;tile.append(title,desc,button('Play this file',()=>play(file)));host.append(tile)}
   return results.length;
 }

 async function streams(media,type,videoId){
  const host=$id('addonResults');host.replaceChildren();
  const ep=type==='series'?String(videoId).match(/:(\d+):(\d+)$/):null;
  if(ep){const note=document.createElement('h3');note.textContent=`${media.name} — S${String(ep[1]).padStart(2,'0')}E${String(ep[2]).padStart(2,'0')} sources`;host.append(note)}
  const available=showCloudMatches(host,media,type,videoId);
  const candidates=installed.filter(a=>a.enabled&&supports(a,'stream',type,videoId));
  if(!candidates.length&&!window.BeaconExpress?.hasEnabled())return message(`${available} cloud file(s) match. No enabled stream providers.`,!available);
  message(`Querying ${candidates.length} compatible stream provider(s)…`);
  const results=await Promise.all(candidates.map(async addon=>{
    try{const data=await jget(endpoint(addon,'stream',type,videoId));return {addon,items:Array.isArray(data.streams)?data.streams:[],error:null}}
    catch(e){return {addon,items:[],error:e.message}}
  }));
  let total=0;let direct=0;
  for(const {addon,items,error} of results){
    const summary=document.createElement('p');summary.className=error?'error':'muted';
    summary.textContent=`${addon.name}: ${error?'Request failed — '+error:items.length+' result(s)'}`;host.append(summary);
    if(error)continue;
    for(const [i,item] of (window.BeaconPreferences?.sortSources(items)||items).entries()){
      total++;const tile=document.createElement('div');tile.className='tile';
      const title=document.createElement('strong');title.textContent=item.name||item.title||`Source ${i+1}`;
      const description=document.createElement('p');description.textContent=item.description|| (item.infoHash?'Torrent descriptor (not directly browser-playable)':'Source result');
      tile.append(title,description);const quality=document.createElement('span');quality.className='source-quality';quality.textContent='Quality: '+(window.BeaconPreferences?.qualityOf(item)||'Unknown');tile.append(quality);
      let valid=false;if(typeof item.url==='string')try{valid=safeUrl(item.url).protocol==='https:'}catch{}
      if(valid){direct++;tile.append(button('Play in Beacon',()=>play({title:media.name,kind:'url',source:addon.name,url:item.url})))}
      else{window.BeaconResolver?.addButtons(tile,item,media.name);const note=document.createElement('p');note.className='muted';note.textContent=item.infoHash?'Magnet/torrent result: choose a connected cloud service below to process this source.':item.externalUrl?'External playback destination (not supported inside Beacon).':'No direct HTTPS playable URL provided.';tile.append(note)}
      window.BeaconExperience?.attachDismiss(tile);host.append(tile);
    }
  }
  const expressCount = await window.BeaconExpress?.searchInto(host,media,type,videoId,{play,resolve:window.BeaconResolver,qualityOf:window.BeaconPreferences?.qualityOf}) || 0;
  message(`${available} cloud match(es); ${total} Stremio result(s); ${expressCount} Express result(s). ${total+expressCount===0&&!available?'No source matches found.':'Choose a compatible source below.'}`);
 }
 const normalizeName=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const seriesRank=(media,term)=>{const n=normalizeName(media.name),q=normalizeName(term);if(n===q)return 0;if(n.startsWith(q+' '))return 2;if(n.includes(q))return 3;return 5};
 const episodeNumbers=(video)=>{
   let season=Number(video.season),episode=Number(video.episode);
   const id=String(video.id||'');const match=id.match(/:(\d+):(\d+)(?:$|:)/);
   if(match){if(!Number.isInteger(season)||season<0)season=Number(match[1]);if(!Number.isInteger(episode)||episode<=0)episode=Number(match[2]);}
   const title=String(video.title||video.name||'');const label=title.match(/S(\d{1,2})E(\d{1,3})|(?:^|\s)(\d{1,2})x(\d{1,3})(?:\s|$)/i);
   if(label){if(!Number.isInteger(season)||season<0)season=Number(label[1]||label[3]);if(!Number.isInteger(episode)||episode<=0)episode=Number(label[2]||label[4]);}
   return {season:Number.isInteger(season)&&season>=0?season:null,episode:Number.isInteger(episode)&&episode>0?episode:null};
 };
 async function detail(addon,media){try{
   const host=$id('addonResults');host.replaceChildren();let full=media;
   if(hasResource(addon,'meta')){const data=await jget(endpoint(addon,'meta',media.type,media.id));if(data.meta)full=data.meta}
   window.BeaconExperience?.setPoster(full.name||media.name,full.poster||media.poster);
   const back=button('← Back to results',()=>search());back.className='beacon-back';host.append(back);
   const header=document.createElement('section');header.className='beacon-detail';
   if(/^https:\/\//.test(full.poster||media.poster||'')){const art=document.createElement('img');art.src=full.poster||media.poster;art.alt='';art.loading='lazy';header.append(art)}
   const intro=document.createElement('div');const h=document.createElement('h2');h.textContent=full.name||media.name;
   const subtitle=document.createElement('p');subtitle.textContent=[full.releaseInfo||media.releaseInfo,full.genres?.join(', ')].filter(Boolean).join(' • ');
   const desc=document.createElement('p');desc.textContent=full.description||media.description||'';intro.append(h,subtitle,desc);header.append(intro);host.append(header);
   if(full.type==='series'){
     const videos=Array.isArray(full.videos)?full.videos:[];
     if(!videos.length){message('No episode metadata returned for this series. Choose another catalog result.',true);return}
     const seasons=new Map();
     for(const video of videos){const parsed=episodeNumbers(video);if(parsed.season===null)continue;if(!seasons.has(parsed.season))seasons.set(parsed.season,[]);seasons.get(parsed.season).push({video,...parsed})}
     if(!seasons.size){message('The catalog returned episode entries without valid season identifiers.',true);return}
     const toolbar=document.createElement('div');toolbar.className='beacon-season-bar';
     const seasonLabel=document.createElement('label');seasonLabel.textContent='Choose season ';
     const picker=document.createElement('select');picker.setAttribute('aria-label','Select television season');
     for(const n of [...seasons.keys()].sort((a,b)=>a-b)){const option=document.createElement('option');option.value=String(n);option.textContent=n===0?'Specials':`Season ${n} (${seasons.get(n).length} entries)`;picker.append(option)}
     seasonLabel.append(picker);toolbar.append(seasonLabel);host.append(toolbar);
     const episodeList=document.createElement('div');episodeList.className='beacon-episodes';host.append(episodeList);
     const showSeason=()=>{episodeList.replaceChildren();const entries=[...(seasons.get(Number(picker.value))||[])].sort((a,b)=>(a.episode??Infinity)-(b.episode??Infinity));
       for(const {video,season:sn,episode:en} of entries){const t=document.createElement('div');t.className='beacon-episode';
         if(/^https:\/\//.test(video.thumbnail||'')){const img=document.createElement('img');img.src=video.thumbnail;img.loading='lazy';img.alt='';t.append(img)}
         const body=document.createElement('div');const code=en===null?`Season ${sn} · Unnumbered`:`S${String(sn).padStart(2,'0')}E${String(en).padStart(2,'0')}`;
         const title=document.createElement('strong');title.textContent=`${code} — ${video.title||video.name||'Episode'}`;body.append(title);
         if(video.released){const date=document.createElement('p');date.textContent=String(video.released).slice(0,10);body.append(date)}
         if(video.overview||video.description){const synopsis=document.createElement('p');synopsis.textContent=video.overview||video.description;body.append(synopsis)}
         if(en!==null){const id=`${String(full.id).split(':')[0]}:${sn}:${en}`;body.append(button(`Search ${code}`,()=>streams(full,'series',id)))}
         else {const note=document.createElement('p');note.textContent='No episode number supplied; search disabled to avoid incorrect matches.';body.append(note)}
         t.append(body);episodeList.append(t)}
     };
     picker.value=String([...seasons.keys()].filter(n=>n>0).sort((a,b)=>a-b)[0]??[...seasons.keys()][0]);picker.onchange=showSeason;showSeason();
   }else{host.append(button('Search sources for this movie',()=>streams(full,'movie',full.id)))}
   message('Selected '+full.name+' — ready to search enabled providers.');
 }catch(e){message('Details unavailable: '+e.message,true)}}
 async function search(){const term=$id('addonSearch').value.trim();if(!term)return message('Enter a movie or show title.',true);
   const host=$id('addonResults');host.replaceChildren();const enabled=installed.filter(a=>a.enabled);if(!enabled.length)return message('Install a compatible add-on in Vendors & Packages first.',true);
   message('Searching movie and TV catalogs…');let errors=[];const found=[];
   for(const addon of enabled){for(const catalog of addon.catalogs){if(!catalog.extra.some(e=>e.name==='search'))continue;
     try{const data=await jget(endpoint(addon,'catalog',catalog.type,catalog.id,{search:term}));for(const media of (data.metas||[]).slice(0,30)){
       if(media.id&&media.name&&['movie','series'].includes(media.type))found.push({addon,media})
     }}catch(e){errors.push(addon.name+': '+e.message)}
   }}
   found.sort((a,b)=>seriesRank(a.media,term)-seriesRank(b.media,term)||String(a.media.name).localeCompare(String(b.media.name)));
   for(const {addon,media} of found){const tile=document.createElement('div');tile.className='beacon-poster-card';tile.tabIndex=0;tile.setAttribute('role','button');
     const open=()=>detail(addon,media);tile.onclick=open;tile.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}};
     if(/^https:\/\//.test(media.poster||'')){const cover=document.createElement('img');cover.loading='lazy';cover.referrerPolicy='no-referrer';cover.alt='';cover.src=media.poster;tile.append(cover)}
     else {const empty=document.createElement('div');empty.className='beacon-no-poster';empty.textContent='BEACON';tile.append(empty)}
     const title=document.createElement('strong');title.textContent=media.name;const label=document.createElement('small');label.textContent=[media.releaseInfo||'',media.type==='series'?'TV series':'Movie',addon.name].filter(Boolean).join(' · ');
     tile.append(title,label);host.append(tile)
   }
   message(`${found.length} title(s) found${errors.length?' • Catalog warnings: '+errors.join('; '):''}${!found.length?' — verify your catalog add-ons.':''}`,!found.length&&!!errors.length);
 }
 const DIRECTORY='https://raw.githubusercontent.com/Stremio/stremio-official-addons/master/index.json';
 let directory=[];
 const directoryStatus=(msg,bad=false)=>{const el=$id('addonDirectoryStatus');el.textContent=msg;el.className=bad?'error':'muted'};
 const isStream=m=>(m.resources||[]).some(r=>r==='stream'||r?.name==='stream');
 const isCatalog=m=>Array.isArray(m.catalogs)&&m.catalogs.some(c=>['movie','series'].includes(c?.type));
 const directoryEntries=()=>directory.filter(entry=>{const m=entry.manifest;return m&&Array.isArray(m.types)&&m.types.some(t=>t==='movie'||t==='series')&&(isStream(m)||isCatalog(m))&&typeof entry.transportUrl==='string'&&entry.transportUrl.startsWith('https://')});
 function renderDirectory(){const box=$id('addonDirectoryResults');box.replaceChildren();const query=$id('addonDirectorySearch').value.trim().toLowerCase(),filter=$id('addonDirectoryFilter').value;const entries=directoryEntries().filter(e=>(filter==='all'||(filter==='stream'?isStream(e.manifest):isCatalog(e.manifest)))&&((e.manifest.name||'').toLowerCase().includes(query)));for(const entry of entries.slice(0,100)){const m=entry.manifest;const tile=document.createElement('div');tile.className='vendorrow';const info=document.createElement('div');const title=document.createElement('strong');title.textContent=m.name||'Unnamed';const desc=document.createElement('p');desc.className='muted';desc.textContent=[isStream(m)?'Stream API':'No streams',isCatalog(m)?'Movie/series catalogs':'No catalog',String(m.description||'').slice(0,150)].join(' • ');info.append(title,desc);const install=button(installed.some(a=>a.url===entry.transportUrl)?'Installed':'Use URL',()=>{$id('addonUrl').value=entry.transportUrl;$id('addonUrl').focus();directoryStatus('URL copied to the installer above. Select Install add-on to validate it.')});if(installed.some(a=>a.url===entry.transportUrl))install.disabled=true;tile.append(info,install);box.append(tile)}directoryStatus(`${entries.length} matching official listing(s). ${entries.length>100?'Showing first 100.':''} Installation still validates the live manifest.`)}
 $id('loadAddonDirectory').onclick=async()=>{directoryStatus('Loading official Stremio directory…');try{const data=await jget(DIRECTORY);if(!Array.isArray(data))throw Error('Directory response was not a list');directory=data.filter(x=>x&&x.manifest&&x.transportUrl);renderDirectory()}catch(e){directoryStatus('Directory unavailable: '+e.message+'. You can still paste individual add-on URLs.',true)}};
 $id('addonDirectoryFilter').onchange=renderDirectory;
 $id('addonDirectorySearch').oninput=renderDirectory;
 $id('searchAddons').onclick=search;$id('addonSearch').addEventListener('keydown',e=>{if(e.key==='Enter')search()});renderInstalled();
})();
