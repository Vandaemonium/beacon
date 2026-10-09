/* VLC-compatible M3U playlist, created entirely inside the extension. */
export function makeVlcPlaylist(url, title = 'Beacon stream') {
  if (typeof url !== 'string' || /[\r\n\0]/.test(url)) throw new Error('Invalid streaming URL');
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('Invalid streaming URL'); }
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Only HTTP(S) streams can be added to VLC playlists');
  const label = String(title || 'Beacon stream').replace(/[\r\n\0,]/g, ' ').trim().slice(0, 140) || 'Beacon stream';
  return `#EXTM3U\n#EXTINF:-1,${label}\n${url}\n`;
}
export function downloadVlcPlaylist(url, title) {
  const contents = makeVlcPlaylist(url, title);
  const name = String(title || 'Beacon stream').replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Beacon stream';
  const blob = new Blob([contents], { type: 'audio/x-mpegurl' });
  const objectUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = `${name}.m3u`;
    a.style.display = 'none';
    document.body.appendChild(a);
    try { a.click(); } finally { a.remove(); }
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
  }
}
