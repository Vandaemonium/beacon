/* Beacon 3.1: opt-in-free local viewing history and resume. No credentials are recorded. */
'use strict';
window.BeaconExperience=(()=>{
 const KEY='beacon:media:history:v1';let records=[];let current=null;let last=0;let initializing=false;let seekTarget=0;
 try{const stored=JSON.parse(localStorage.getItem(KEY)||'[]');records=Array.isArray(stored)?stored:[]}catch{}
 const $=id=>document.getElementById(id),video=$('video');
 function persist(){localStorage.setItem(KEY,JSON.stringify(records.slice(0,150)))}
 function idFor(item){return [item.source||'',item.title||''].join('::').toLowerCase()}
 function begin(item,player,url){flush();initializing=true;const id=idFor(item);current={id,title:item.title||'Untitled',source:item.source||'',url:typeof url==='string'&&url.startsWith('https://')?url:'',position:0,duration:0,updated:Date.now()};const old=records.find(r=>r.id===id);if(old){current.position=Number(old.position)||0;current.duration=Number(old.duration)||0}seekTarget=Number(current.position)||0;last=0;render()}
 function flush(){if(!current||initializing)return;const duration=Number(video.duration);const position=Number(video.currentTime);if(Number.isFinite(duration)&&duration>0)current.duration=duration;if(Number.isFinite(position)&&position>=0)current.position=position;current.updated=Date.now();records=[{...current},...records.filter(r=>r.id!==current.id)].slice(0,150);persist();render()}
 function progress(){if(!current||initializing)return;const now=Date.now();if(now-last<8000)return;last=now;flush()}
 video.addEventListener('timeupdate',progress);video.addEventListener('pause',()=>{if(!initializing)flush()});video.addEventListener('ended',()=>{if(current){current.position=0;flush()}});
 function applyResume(){if(!current)return;const d=Number(video.duration)||0;const p=Number(seekTarget)||0;if(p<=10)return;if(d>0&&p>=d-15){seekTarget=0;return}try{if(video.seekable?.length){const max=video.seekable.end(video.seekable.length-1);if(max<p)return}video.currentTime=p;seekTarget=0;initializing=false}catch{}}
 video.addEventListener('loadedmetadata',()=>{initializing=false;applyResume()});video.addEventListener('canplay',applyResume);video.addEventListener('durationchange',applyResume);video.addEventListener('seeked',()=>{seekTarget=0});
 const btn=(name,click)=>{const b=document.createElement('button');b.textContent=name;b.onclick=click;return b};
 const format=s=>{s=Math.floor(Math.max(0,s||0));return `${Math.floor(s/3600)}:${String(Math.floor(s%3600/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`};
 function render(){const root=$('historyItems');if(!root)return;root.replaceChildren();if(!records.length){const p=document.createElement('p');p.className='beacon-empty';p.textContent='No viewing history yet. Play something to start tracking.';root.append(p);return}
 for(const r of records){const t=document.createElement('div');t.className='tile';const name=document.createElement('strong');name.textContent=r.title;const desc=document.createElement('p');desc.textContent=`${r.source||'Source'} • ${format(r.position)} watched${r.duration?' / '+format(r.duration):''}`;t.append(name,desc);if(r.duration){const track=document.createElement('div');track.className='beacon-history-progress';const fill=document.createElement('div');fill.style.width=Math.min(100,Math.round(100*r.position/r.duration))+'%';track.append(fill);t.append(track)}
 if(r.url&&r.url.startsWith('https://'))t.append(btn('Resume',()=>{if(typeof play==='function')play({title:r.title,source:r.source,kind:'url',url:r.url})}));t.append(btn('Remove history entry',()=>{records=records.filter(x=>x.id!==r.id);persist();render()}));root.append(t)} }
 $('clearHistory')?.addEventListener('click',()=>{if(confirm('Clear Beacon watch history?')){records=[];current=null;seekTarget=0;initializing=false;persist();render()}});
 const POSTER_KEY='beacon:media:posters:v1';let posters={};try{posters=JSON.parse(localStorage.getItem(POSTER_KEY)||'{}')}catch{}
 function norm(v){return String(v||'').replace(/\.(mkv|mp4|avi|webm)$/i,'').replace(/\b(1080p|2160p|720p|bluray|webrip|web-dl|h264|x264|aac)\b/gi,' ').replace(/[._\[\]()-]/g,' ').replace(/\s+/g,' ').trim().toLowerCase()}
 function setPoster(name,url){if(typeof url!=='string'||!url.startsWith('https://'))return;posters[norm(name)]=url;localStorage.setItem(POSTER_KEY,JSON.stringify(posters))}
 function posterFor(name){const k=norm(name);if(posters[k])return posters[k];const match=Object.keys(posters).find(x=>x.length>=8&&(k.includes(x)||x.includes(k)));return match?posters[match]:''}
 function attachDismiss(tile){tile.append(btn('Hide this result',()=>tile.remove()));}
 render();return {begin,flush,attachDismiss,render,posterFor,setPoster};
})();
