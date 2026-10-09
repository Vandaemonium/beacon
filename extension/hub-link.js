'use strict';
// Beacon 4.0: Movies / TV Shows now open the new poster interface; Media Hub keeps providers, vendors & backups.
const go=(id,url)=>document.getElementById(id)?.addEventListener('click',()=>{location.href=url});
go('cloudMovies','beacon.html#/movies');
go('cloudSeries','beacon.html#/shows');
go('openMediaHub','media.html#providers');
go('loginMediaHub','beacon.html');
go('beaconHome','beacon.html');
go('loginBeaconHome','beacon.html');

// Beacon 4.0: the page CSP (style-src 'self') silently blocks inline style="" attributes that app.js
// writes into its HTML (Continue Watching progress bars, hero artwork). Re-apply them through CSSOM,
// which CSP allows, without changing app.js behaviour.
(()=>{const fix=root=>{for(const el of root.querySelectorAll?.('[style]')||[]){const v=el.getAttribute('style');if(v&&!el.dataset.cssFixed){el.dataset.cssFixed='1';el.style.cssText=v}}};
const target=document.getElementById('content');if(!target)return;fix(target);
new MutationObserver(m=>{for(const r of m)for(const n of r.addedNodes)if(n.nodeType===1){if(n.hasAttribute('style'))fix(n.parentNode||n);fix(n)}}).observe(target,{childList:true,subtree:true});})();
