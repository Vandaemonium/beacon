/* Beacon 2.9 (4.0 data API added) restricted Express JSON format compatibility. No remote script eval. */
'use strict';
window.BeaconExpress=(()=>{
 const KEY='beacon:express:packages:v1'; const $=id=>document.getElementById(id);
 // Website (Empyrean): provider sites block cross-site browser requests, so Beacon's server fetches the
 // page through its VPN (only for sites in the shared packages) and parsing stays here, unchanged.
 const onWeb=(typeof chrome==='undefined'||!chrome?.storage?.local)&&/^https?:$/.test(location.protocol);
 const pfetch=(url,opts={})=>onWeb?fetch('/api/express/fetch?url='+encodeURIComponent(url),{signal:opts.signal,headers:opts.headers}):fetch(url,opts);
 let pkgs=[];try{pkgs=JSON.parse(localStorage.getItem(KEY)||'[]');if(!Array.isArray(pkgs))pkgs=[]}catch{pkgs=[]}
 const save=()=>localStorage.setItem(KEY,JSON.stringify(pkgs));
 const text=(s,err=false)=>{const el=$('expressStatus');if(el){el.textContent=s;el.className=err?'error':'muted'}};
 const safe=url=>{const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password)throw Error('Public HTTPS URL required');if(['localhost','127.0.0.1','0.0.0.0'].includes(u.hostname)||u.hostname.endsWith('.local'))throw Error('Local network destinations unsupported');return u};
 const path=(o,key)=>{if(typeof key!=='string'||!/^[a-zA-Z0-9_$.-]+$/.test(key))return undefined;return key.split('.').reduce((v,k)=>v&&typeof v==='object'?v[k]:undefined,o)};
 const format=(v,tokens)=>String(v??'').replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g,(_,key)=>tokens[key]??'');
 const selection = expr => typeof expr === 'string' && /^doc\.querySelectorAll\(\s*(['"])(.*?)\1\s*\)$/.test(expr.trim());
 const field = expr => typeof expr === 'string' && /^(?:row(?:\.querySelector\(\s*(['"])(.*?)\1\s*\))?\.(?:textContent|innerText)|row\.querySelector\(\s*(['"])(.*?)\3\s*\)\.getAttribute\(\s*(['"])(href|title|data-[\w-]+)\5\s*\))$/.test(expr.trim());
 function status(r){
  if(!r || typeof r.base_url!=='string' || !/^https:\/\//i.test(r.base_url))return 'Invalid or missing HTTPS endpoint';
  if(!r.movie?.query && !r.episode?.query)return 'No supported movie/episode search';
  if(r.token)return 'Token-based API unsupported';
  if(r.source_is_in_sub_page)return 'Requires secondary-page extraction';
  if(r.response_type==='json' && r.json_format && typeof r.json_format==='object')return 'JSON parser available (experimental)';
  if(r.response_type==='text' && r.html_parser){
   const hp=r.html_parser;
   if(!selection(hp.row))return 'HTML row expression requires script execution';
   if(!field(hp.title) || !field(hp.url))return 'HTML title/link expression requires script execution';
   return 'HTML selector parser available (experimental)';
  }
  return 'Unsupported response format or script-based rules';
 }
 const supported=r=>/^((JSON|HTML) .*available)/.test(status(r));
 function render(){for(const pack of pkgs)for(const prov of pack.providers||[]){const old=prov.supported;prov.supported=!!supported(prov.rules);prov.reason=status(prov.rules);if(!prov.supported)prov.enabled=false;}save();const root=$('expressPackages');if(!root)return;root.replaceChildren();for(const pack of pkgs){const box=document.createElement('div');box.className='vendorrow';const left=document.createElement('div');const h=document.createElement('strong');h.textContent=pack.name;left.append(h);const help=document.createElement('p');help.className='muted';help.textContent=`${pack.providers.length} provider rules • ${pack.providers.filter(p=>p.enabled).length} enabled • ${pack.origin}`;left.append(help);const actions=document.createElement('div');actions.className='vendorbuttons';const remove=document.createElement('button');remove.textContent='Remove package';remove.onclick=()=>{pkgs=pkgs.filter(x=>x.id!==pack.id);save();render()};actions.append(remove);box.append(left,actions);root.append(box);
  for(const rule of pack.providers){const row=document.createElement('div');row.className='vendorrow';const info=document.createElement('div');const title=document.createElement('strong');title.textContent=rule.name;const sub=document.createElement('p');sub.className='muted';sub.textContent=rule.reason || status(rule.rules);info.append(title,sub);const enable=document.createElement('button');enable.textContent=rule.enabled?'✓ Enabled':'Enable';enable.disabled=!rule.supported;enable.onclick=()=>{rule.enabled=!rule.enabled;save();render()};row.append(info,enable);root.append(row)} }
 }
 async function importURL(){try{const url=safe($('expressUrl').value.trim());text('Fetching Express JSON package…');const r=await fetch(url.href,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('HTTP '+r.status);const raw=await r.text();if(raw.length>2500000)throw Error('Package too large');const data=JSON.parse(raw);if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Not an Express object');const entries=Object.entries(data).filter(([k,v])=>k!=='_manifest'&&v&&typeof v==='object'&&!Array.isArray(v)&&v.name);if(!entries.length)throw Error('No recognizable Express provider rules');const providers=entries.slice(0,150).map(([id,r])=>({id,name:String(r.name).slice(0,100),enabled:false,supported:!!supported(r),reason:status(r),rules:r}));if(pkgs.some(p=>p.origin===url.href))throw Error('Package URL already imported');pkgs.push({id:crypto.randomUUID(),name:String(data._manifest?.name||'Express Package'),origin:url.href,providers});save();render();text(`Imported ${providers.length} provider definitions; ${providers.filter(p=>p.supported).length} limited-parser candidates. All start disabled.`)}catch(e){text('Import failed: '+e.message,true)}}
 $('expressImport')?.addEventListener('click',importURL);
 async function checkConnections(){
  const target=$('expressHealthResults');if(!target)return;
  target.replaceChildren();const enabled=pkgs.flatMap(p=>(p.providers||[]).filter(x=>x.enabled&&x.supported));
  if(!enabled.length){target.textContent='No enabled compatible providers to check.';return}
  const info=document.createElement('p');info.textContent=`Checking ${enabled.length} provider endpoints without performing searches…`;target.append(info);
  const checks=await Promise.all(enabled.map(async p=>{
    try{
      const base=safe(p.rules.base_url);const started=performance.now();
      // Do not submit a movie title, cookies, credentials, or source requests.
      const result=await pfetch(base.href,{method:'GET',redirect:'follow',signal:AbortSignal.timeout(8000)});
      return {name:p.name,detail:`HTTP ${result.status} · ${Math.round(performance.now()-started)}ms · ${base.hostname}`,ok:result.ok};
    }catch(e){let note=e?.name==='TimeoutError'?'Timed out':e?.message==='Failed to fetch'?'Network error / blocked request (possibly browser or provider restrictions)':String(e?.message||e);return {name:p.name,detail:note,ok:false}}
  }));
  info.textContent=`Connectivity checks finished: ${checks.filter(x=>x.ok).length}/${checks.length} endpoints responded with HTTP 2xx. This is not a source-search or playback test.`;
  for(const c of checks){const p=document.createElement('p');p.className=c.ok?'muted':'error';p.textContent=`${c.name}: ${c.detail}`;target.append(p)}
 }
 $('expressHealthCheck')?.addEventListener('click',checkConnections);

 const hasEnabled=()=>pkgs.some(p=>p.providers.some(r=>r.enabled&&r.supported));
 const label=(t)=>{const a=document.createElement('p');a.className='muted';a.textContent=t;return a};
 const button=(name,cb)=>{const b=document.createElement('button');b.textContent=name;b.onclick=cb;return b};
 const request=async(rule,media,type,videoId)=>{
  const r=rule.rules;const mode=type==='series'?'episode':'movie';const cfg=r[mode];if(!cfg?.query)throw Error('No '+mode+' query rule');
  const year=String(media.releaseInfo||media.year||'').match(/\b(?:19|20)\d{2}\b/)?.[0]||'';
  const ep=String(videoId).match(/:(\d+):(\d+)$/);const episodeCode=ep?'S'+ep[1].padStart(2,'0')+'E'+ep[2].padStart(2,'0'):'';
  const word=Array.isArray(cfg.keywords)?cfg.keywords[0]:cfg.keywords||'{title} {year}';
  const tokens={title:media.name||'',year,imdbId:(String(media.id||'').match(/tt\d+/)||[])[0]||'',episodeCode,seasonCode:ep?'S'+ep[1].padStart(2,'0'):'',episode:ep?.[2]||'',query:''};
  tokens.query=format(word,tokens).trim();
  const base=safe(r.base_url);const route=format(cfg.query,{...tokens,query:encodeURIComponent(tokens.query)});
  if(!route.startsWith('/'))throw Error('Only relative request paths are allowed');
  const url=safe(new URL(route,base).href);if(url.origin!==base.origin)throw Error('Provider endpoint crossed origins');
  let response;try{response=await pfetch(url.href,{signal:AbortSignal.timeout(12000),headers:{Accept:r.response_type==='text'?'text/html':'application/json'}})}catch(e){throw Error((e?.name==='TimeoutError'?'Request timed out':e?.message==='Failed to fetch'?'Network fetch blocked or destination unavailable':String(e?.message||e))+' ('+url.hostname+')')} if(!response.ok)throw Error('HTTP '+response.status+' from '+url.hostname);
  if(r.response_type==='text'){
    const html=await response.text(); if(html.length>2500000)throw Error('HTML response over limit');
    const doc=new DOMParser().parseFromString(html,'text/html');
    doc.querySelectorAll('script,iframe,object,embed,base,link[rel=preload]').forEach(n=>n.remove());
    const hp=r.html_parser;
    const rowMatch=hp.row.trim().match(/^doc\.querySelectorAll\(\s*(['"])(.*?)\1\s*\)$/);
    if(!rowMatch)throw Error('Unsupported HTML selector expression');
    function extract(row, expression){
      if(!field(expression))return '';
      const v=expression.trim();
      const target=v.match(/^row\.querySelector\(\s*(['"])(.*?)\1\s*\)/);
      const node=target?row.querySelector(target[2]):row;
      if(!node)return '';
      const att=v.match(/\.getAttribute\(\s*(['"])(.*?)\1\s*\)$/);
      return String(att?node.getAttribute(att[2])||'':node.textContent||'').trim();
    }
    const rows=[...doc.querySelectorAll(rowMatch[2])].slice(0,40);
    return rows.map(row=>({title:extract(row,hp.title),url:extract(row,hp.url),quality:extract(row,hp.quality),size:extract(row,hp.size)})).filter(item=>item.title && /^(magnet:|https:\/\/)/i.test(item.url));
  }
  const body=await response.json();const f=r.json_format;let rows=f.results?path(body,f.results):body;
  if(!Array.isArray(rows))throw Error('Results field was not an array');
  return rows.slice(0,40).map(row=>{const title=String(path(row,f.title)||row.title||row.name||'Result');const hash=path(row,f.hash);let link=path(row,f.url);if(typeof f.url==='string'&&f.url.startsWith('magnet:')&&typeof hash==='string')link=f.url.replace(/\{hash\}/g,hash);return {title,infoHash:typeof hash==='string'&&/^[0-9a-f]{40}$/i.test(hash)?hash:undefined,url:typeof link==='string'?link:undefined,quality:String(path(row,f.quality)||''),size:String(path(row,f.size)||'')}}).filter(x=>x.infoHash||x.url);
 };
 async function searchInto(host,media,type,id,opts){let count=0;const rules=pkgs.flatMap(p=>p.providers.filter(x=>x.enabled&&x.supported));if(!rules.length)return 0;
  host.append(label(`Express: querying ${rules.length} enabled compatible provider(s)…`));
  const responses=await Promise.all(rules.map(async rule=>{try{return {rule,items:await request(rule,media,type,id)}}catch(e){return {rule,error:e.message}}}));
  const wanted=type==='series'?String(id).match(/:(\d+):(\d+)$/):null;
  const matchesEpisode=(title)=>{if(!wanted)return true;const season=Number(wanted[1]),episode=Number(wanted[2]);const name=String(title||'');const match=name.match(/\bS(\d{1,2})[ ._-]*E(\d{1,3})\b/i)||name.match(/\b(\d{1,2})x(\d{1,3})\b/i);return !!match&&Number(match[1])===season&&Number(match[2])===episode};
  for(const data of responses){const items=(data.items||[]).filter(item=>matchesEpisode(item.title));host.append(label(`${data.rule.name}: ${data.error?'Error — '+data.error:wanted?items.length+' matching episode(s) of '+data.items.length+' candidates':items.length+' candidate(s)'}`));for(const item of items){count++;const tile=document.createElement('div');tile.className='tile';const art=window.BeaconExperience?.posterFor(item.title);if(art){const cover=document.createElement('img');cover.className='beacon-poster';cover.src=art;cover.loading='lazy';cover.alt='';cover.referrerPolicy='no-referrer';tile.append(cover)}const head=document.createElement('strong');head.textContent=item.title;tile.append(head,label(`Express · ${data.rule.name} · ${item.quality||'Quality unknown'} ${item.size||''}`));if(item.url?.startsWith('https://'))tile.append(button('Play in Beacon',()=>opts.play({title:item.title,kind:'url',source:data.rule.name,url:item.url})));else opts.resolve?.addButtons(tile,item,item.title);window.BeaconExperience?.attachDismiss(tile);host.append(tile)}}return count;
 }
 // Beacon 4.0: data-level access for the new poster UI (same request/parsing rules, no DOM).
 const enabledRules=()=>pkgs.flatMap(p=>(p.providers||[]).filter(x=>x.enabled&&x.supported));
 render();return {hasEnabled,searchInto,enabledRules,enabledCount:()=>enabledRules().length,searchRule:request};
})();
