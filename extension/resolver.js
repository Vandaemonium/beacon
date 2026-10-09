/* Beacon 2.3 cloud source resolver. Explicit user action only. */
'use strict';
window.BeaconResolver=(()=>{
 const $=id=>document.getElementById(id);
 const token=name=>localStorage.getItem('beacon:hub:'+name)||sessionStorage.getItem('beacon:hub:'+name)||'';
 const state={jobs:[]};
 const video=/\.(mp4|m4v|webm|mov|mkv|avi|ts)(?:$|[?#])/i;
 const container=$('cloudJobs');
 const status=$('cloudStatus');
 const text=(s,bad=false)=>{status.textContent=s;status.className=bad?'error':'muted'};
 const btn=(label,fn)=>{const b=document.createElement('button');b.textContent=label;b.addEventListener('click',fn);return b};
 const magnetFor=s=>{
   if(typeof s.url==='string'&&s.url.startsWith('magnet:?'))return s.url;
   if(typeof s.infoHash==='string'&&/^[0-9a-f]{40}$/i.test(s.infoHash))return 'magnet:?xt=urn:btih:'+s.infoHash;
   return null;
 };
 const validateMagnet=value=>{
   if(typeof value!=='string'||!value.startsWith('magnet:?'))throw Error('Provider returned no valid magnet link');
   const params=new URLSearchParams(value.slice('magnet:?'.length));
   const xt=params.getAll('xt').find(x=>/^urn:btih:(?:[a-f0-9]{40}|[a-z2-7]{32})$/i.test(x));
   if(!xt)throw Error('Provider magnet is missing a valid torrent hash (btih)');
   if(value.length>16000)throw Error('Provider magnet URL is too long');
   return value;
 };
 const response=async(url,opts={})=>{
   const r=await fetch(url,{...opts,signal:AbortSignal.timeout(25000)});
   const raw=await r.text();let obj;
   try{obj=raw?JSON.parse(raw):{}}catch{obj={detail:raw.slice(0,350)}}
   if(!r.ok||obj.success===false){
     const detail=[obj.detail,obj.error,obj.message].filter(x=>x!=null&&x!=='').map(x=>typeof x==='string'?x:JSON.stringify(x)).join(' — ');
     throw Error(`HTTP ${r.status}${detail?' — '+detail.slice(0,500):' (TorBox returned no further explanation)'}`);
   }
   return obj;
 };
 const tor=async(path,options={})=>{
   const key=token('torbox');if(!key)throw Error('Connect TorBox under Accounts');
   const u=new URL('https://api.torbox.app/v1/api/torrents/'+path);
   for(const [k,v] of Object.entries(options.query||{}))u.searchParams.set(k,String(v));
   // TorBox requestdl uniquely requires the API token as a query parameter.
   // Other endpoints continue to authenticate with the Bearer header.
   if(path==='requestdl')u.searchParams.set('token',key);
   const r=await response(u.href,{method:options.method||'GET',headers:{Authorization:'Bearer '+key},body:options.body});
   if(r.success===false)throw Error(String(r.detail||r.error||'TorBox request failed'));
   return r.data;
 };
 const premium=async(path,params)=>{
   const key=token('premiumize');if(!key)throw Error('Connect Premiumize under Accounts');
   const body=new URLSearchParams({...params,apikey:key});
   const r=await response('https://www.premiumize.me/api/'+path,{method:'POST',body});
   if(r.status!=='success')throw Error(String(r.message||r.error||'Premiumize request failed'));
   return r;
 };
 const render=()=>{
   container.replaceChildren();
   for(const job of state.jobs){
     const tile=document.createElement('div');tile.className='tile';
     const art=window.BeaconExperience?.posterFor(job.title);if(art){const cover=document.createElement('img');cover.className='beacon-poster';cover.src=art;cover.loading='lazy';cover.alt='';cover.referrerPolicy='no-referrer';tile.append(cover)}const h=document.createElement('strong');h.textContent=job.title+' · '+job.service;
     const s=document.createElement('p');s.textContent=job.note||'Processing';tile.append(h,s);tile.append(btn('Remove from Beacon list',()=>{state.jobs=state.jobs.filter(x=>x!==job);render();text('Removed from the Beacon list. Your cloud files were not deleted.')}));
     if(job.service==='TorBox'&&job.id)tile.append(btn('Check status / list files',()=>refreshTorbox(job)));
     if(job.service==='Premiumize'&&job.id)tile.append(btn('Check cloud files',()=>refreshPremiumize(job)));
     for(const f of job.files||[]){
       const name=document.createElement('p');name.textContent=f.name;tile.append(name);
       if(f.url)tile.append(btn('Play / open '+f.name,()=>launch(job,f)));
       else if(job.service==='TorBox'&&f.id!=null)tile.append(btn('Get playable link',()=>openTorFile(job,f)));
     }
     container.append(tile);
   }
 };
 const launch=(job,f)=>{try{
   const u=new URL(f.url);if(u.protocol!=='https:')throw Error('Secure HTTPS media URL required');
   play({title:f.name||job.title,kind:'url',source:job.service,url:u.href});
   text('Opening '+f.name+'; browser codec compatibility depends on the file format.');
 }catch(e){text(e.message,true)}};
 async function openTorFile(job,f){try{
   text('Requesting TorBox link…');const data=await tor('requestdl',{query:{torrent_id:job.id,file_id:f.id}});
   const url=typeof data==='string'?data:data?.url||data?.link;
   if(!url)throw Error('TorBox did not return a direct link');f.url=url;render();launch(job,f)
 }catch(e){text('TorBox: '+e.message,true)}}
 async function refreshTorbox(job){try{
   text('Checking TorBox cloud status…');const data=await tor('mylist',{query:{id:job.id}});
   const torrent=(Array.isArray(data)?data.find(x=>String(x.id)===String(job.id)):data)||null;
   if(!torrent)throw Error('Torrent not visible in your cloud list yet');
   job.note='Status: '+String(torrent.download_state||torrent.status||'pending');
   job.files=(torrent.files||[]).filter(f=>video.test(f.name||f.short_name||'')).map(f=>({id:f.id,name:f.name||f.short_name||'Video'}));
   if(!job.files.length)job.note+=' — no video files ready; try checking again later';
   render();text(job.note);
 }catch(e){text('TorBox status: '+e.message,true)}}
 async function refreshPremiumize(job){try{
   text('Checking Premiumize cloud files…');
   // Folder IDs vary by transfer. Show transfer status rather than assuming root link mapping.
   const u=new URL('https://www.premiumize.me/api/transfer/list');u.searchParams.set('apikey',token('premiumize'));
   const r=await response(u.href);if(r.status!=='success')throw Error(r.message||'Transfer status unavailable');
   const transfer=(r.transfers||[]).find(t=>String(t.id)===String(job.id));
   job.note=transfer?`Status: ${transfer.status||'unknown'}${transfer.message?' — '+transfer.message:''}`:'Transfer not found. Check Cloud Library for completed files.';
   render();text(job.note);
 }catch(e){text('Premiumize status: '+e.message,true)}}
 async function submit(service,source,title){
   let magnet;try{magnet=validateMagnet(magnetFor(source))}catch(e){return text(e.message,true)}
   if(!confirm(`Submit “${title}” to ${service}? Only submit media you have permission to access. This may use your account quota.`))return;
   const job={title,service,note:'Submitting…',files:[]};state.jobs.unshift(job);render();
   try{
     if(service==='TorBox'){
       const data=new FormData();data.append('magnet',magnet);
       const result=await tor('createtorrent',{method:'POST',body:data});job.id=result?.torrent_id;
       if(job.id==null)throw Error('No torrent ID returned');job.note='Submitted; check status for cloud files';
       await refreshTorbox(job);
     }else{
       // Try direct resolution first; this may work for cached torrents without a stored transfer.
       try{
         const direct=await premium('transfer/directdl',{src:magnet});
         job.files=(direct.content||[]).filter(f=>typeof f.link==='string'&&video.test(f.path||f.link)).map(f=>({name:f.path||'Video',url:f.link}));
       }catch(e){job.note='Direct resolution unavailable: '+e.message}
       if(job.files.length){job.note=job.files.length+' file(s) available';}
       else{
         const result=await premium('transfer/create',{src:magnet});job.id=result.id;
         job.note='Submitted to Premiumize cloud; check status then refresh the Cloud Library when completed.';
       }
     }
     render();text(job.note);
   }catch(e){job.note='Failed: '+e.message;render();text(job.note,true)}
 }
 function addButtons(tile,source,title){
   if(!magnetFor(source))return;
   const group=document.createElement('div');group.className='addonchoices';
   group.append(btn('Send to TorBox',()=>submit('TorBox',source,title)),btn('Send to Premiumize',()=>submit('Premiumize',source,title)));
   tile.append(group);
 }
 return {addButtons};
})();
