/* Beacon 2.4 user-owned local preference storage. Never saves account keys. */
'use strict';
window.BeaconPreferences=(()=>{
 const KEY='beacon:playback:preferences:v1';
 const defaults={sourceMode:'manual',quality:'1080p',provider:'auto'};
 let state={...defaults};
 try { const saved=JSON.parse(localStorage.getItem(KEY)||'{}');if(['best','1080p','720p'].includes(saved.quality))state.quality=saved.quality;if(['auto','torbox','premiumize'].includes(saved.provider))state.provider=saved.provider;}catch{}
 const get=()=>({...state});
 const qualityOf=source=>{
   const raw=[source?.name,source?.title,source?.description,source?.filename].filter(Boolean).join(' ');
   if(/\b(2160p|4k|uhd)\b/i.test(raw))return '4K';
   if(/\b1080p\b/i.test(raw))return '1080p';
   if(/\b720p\b/i.test(raw))return '720p';
   if(/\b480p\b/i.test(raw))return '480p';
   return 'Unknown';
 };
 const ranking=(source)=>{
   const resolution=qualityOf(source);
   const order=state.quality==='1080p'?{'1080p':0,'720p':1,'4K':2,'480p':3,'Unknown':4}:state.quality==='720p'?{'720p':0,'1080p':1,'480p':2,'4K':3,'Unknown':4}:{'4K':0,'1080p':1,'720p':2,'480p':3,'Unknown':4};
   return order[resolution]??4;
 };
 const sortSources=arr=>[...arr].sort((a,b)=>ranking(a)-ranking(b));
 function init(){
  const quality=document.getElementById('sourceQuality'),provider=document.getElementById('servicePreference'),mode=document.getElementById('sourceMode'),status=document.getElementById('preferencesSaved');
  if(!quality||!provider)return;mode.value='manual';quality.value=state.quality;provider.value=state.provider;
  const save=()=>{state={sourceMode:'manual',quality:quality.value,provider:provider.value};localStorage.setItem(KEY,JSON.stringify(state));status.textContent='Preferences saved locally. New source searches will use your selected order.'};
  quality.addEventListener('change',save);provider.addEventListener('change',save);
  status.textContent='Manual • '+state.quality+' preferred • '+(state.provider==='auto'?'no provider preference':state.provider+' first');
 }
 document.addEventListener('DOMContentLoaded',init);
 return {get,qualityOf,sortSources};
})();
