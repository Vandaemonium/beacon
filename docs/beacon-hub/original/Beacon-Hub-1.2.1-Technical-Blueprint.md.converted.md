# <a id="_az3yeau9weym"></a>Beacon Hub 1\.2\.1 — As\-Built Extension Blueprint

__Purpose:__ Technical handoff to Claude or another developer to understand, reproduce, maintain, and extend the __actual Beacon Hub 1\.2\.1 Chrome extension__\.  
__Reference artifact:__ Beacon\-Hub\-1\.2\.1\-VLC\.zip \(use alongside this document; this blueprint does not replace source\)\.  
__Scope:__ The current *local Chrome extension*, __not__ the proposed future cloud\-hosted Beacon Hub\.  
__Preservation rule:__ Make modifications in a copy; do not overwrite or regress the working 1\.2\.1 release\.  
__Date:__ October 2026\.

## <a id="_i17levczhb9h"></a>1\. Product overview

Beacon Hub is a Chrome __Manifest V3 extension__ that launches a full\-tab local extension page\. It combines:

- Live IPTV channels, categories, EPG, favorites, hidden categories, and live playback\.
- Movie / TV\-show browsing, metadata, posters, seasons and episodes, list management, source selection, and history/resume\.
- Trakt authorization, lists, history, scrobbling, and synchronization\.
- Premiumize cloud integration and TorBox cloud integration\.
- User\-configured Stremio\-compatible add\-ons and Express provider search adapters\.
- Browser streaming through the HTML5 video element / bundled hls\.js\.
- Browser format compatibility labels and controlled live\-stream reconnect\.
- Network / apparent VPN endpoint diagnostic display\.
- Local settings and an optional encrypted JSON export/import\.
- __1\.2\.1 addition:__ Save a selected media URL as a VLC\-compatible \.m3u playlist\.

The extension is __not a video host, VPN, cloud relay, proxy, Windows launcher, or native messaging integration__\. Provider calls and playback occur in the browser environment subject to permissions, browser codec support, server policy, and network access\. An IP check is a diagnostic, not proof that every individual connection uses a VPN\.

## <a id="_iarpvdw39l2a"></a>2\. Actual extension bootstrap

manifest\.json includes:

\{

  "manifest\_version": 3,

  "name": "Beacon Hub",

  "version": "1\.2\.1",

  "background": \{ "service\_worker": "background\.js" \},

  "permissions": \["storage", "identity"\],

  "host\_permissions": \["http://\*/\*", "https://\*/\*"\],

  "content\_security\_policy": \{

    "extension\_pages": "script\-src 'self'; object\-src 'self'"

  \}

\}

This is an illustrative subset; refer to the original manifest for icon declarations and remaining metadata\. The broad host permissions are __as currently built__, not a recommended minimum for a new build\. A future security review should narrow them where possible\.

background\.js listens to chrome\.action\.onClicked and opens chrome\.runtime\.getURL\('beacon\.html'\) in a new browser tab\. The main interface is __not__ a popup\.

beacon\.html loads app/ui/beacon\.css, the bundled vendor/hls\.min\.js, preferences\.js, express\.js, and the ES module app/ui/main\.js\. It contains navigation to Home, Live TV, Movies, TV Shows, My Lists, Premiumize and Settings\. Navigation uses hash routes like \#/movies and \#/settings\.

The ZIP also includes legacy / related entry files index\.html, app\.js, media\.html, media\.js, media\.css, addon\.js, resolver\.js, backup\.js, hub\-link\.js, experience\.js, and styles\.css\. __Do not assume all of these are unused:__ inspect references before removing or refactoring\.

## <a id="_q27apthueqta"></a>3\. Architecture and data flow

Chrome toolbar Beacon icon

  └─ MV3 background service worker \(background\.js\)

       └─ opens chrome\-extension://<extension\-id>/beacon\.html

            ├─ UI shell / hash router \(app/ui/main\.js\)

            │   ├─ home, lists, movies, shows, details, live, settings

            │   ├─ source selection sheet \(app/ui/sheet\.js\)

            │   ├─ movie player \(app/ui/player\.js\)

            │   └─ live player \(app/ui/live\-player\.js\)

            ├─ integrations \(app/lib/\)

            │   ├─ trakt\.js \(Trakt OAuth/API\)

            │   ├─ iptv\.js \(Xtream\-like player API, channels, EPG\)

            │   ├─ premiumize\.js / torbox\.js

            │   ├─ sources\.js \(source aggregation/resolution\)

            │   ├─ meta\.js / compat\.js / history\.js

            │   ├─ store\.js \(browser persistence & events\)

            │   ├─ netcheck\.js \(external IP lookup\)

            │   └─ vlc\-playlist\.js \(playlist download\)

            └─ browser network \-> configured authorized providers

### <a id="_qi15wngo5dmx"></a>Module responsibilities \(reference paths\)

__File__

__Responsibility__

manifest\.json

MV3 configuration, identity/storage and host permissions

background\.js

Opens Beacon full\-tab page from extension toolbar

beacon\.html

Main full\-screen UI entry and script loading

app/ui/main\.js

Routing, top nav, global actions, initial app orchestration

app/ui/pages\.js, cards\.js, hero\.js, details\.js

Browsing and content presentation

app/ui/sheet\.js

Available sources and source selection

app/ui/player\.js

Movie/episode playback, Trakt scrobbling, VLC menu

app/ui/live\.js, live\-player\.js

Live\-channel UI and player/reconnect behavior

app/ui/settings\.js

Account connections and extension preferences

app/ui/netcheck\-ui\.js

Network/IP\-check UI

app/ui/beacon\.css, dom\.js

Styles and DOM helpers

app/lib/trakt\.js

Trakt client setup, OAuth PKCE, token refresh, lists/sync

app/lib/iptv\.js

IPTV account, API calls, channels, categories, EPG and favorites

app/lib/premiumize\.js

Premiumize API and cloud files

app/lib/torbox\.js

TorBox API and cloud files

app/lib/sources\.js

Searches/normalizes source results from configured sources

app/lib/meta\.js

Metadata/episode/release helpers

app/lib/compat\.js

Browser playback format heuristics

app/lib/history\.js

Progress, resume and viewing\-history handling

app/lib/store\.js

Local persistence, extension\-private storage and events

app/lib/netcheck\.js

Public exit\-IP lookup/heuristic

app/lib/vlc\-playlist\.js

Builds/downloads \.m3u text files

express\.js

Configured Express provider adapters

backup\.js

Settings JSON backup and optional encryption

vendor/hls\.min\.js, hls\.LICENSE\.txt

Local hls\.js bundle and its license

## <a id="_ffix8i219sly"></a>4\. Browsing, source lookup and playback

1. User navigates to Movies or Shows or searches a title\.
2. The UI assembles movie/episode identifiers and metadata, showing detail cards and episode lists\.
3. On selecting a title/episode, app/ui/sheet\.js presents available sources gathered via app/lib/sources\.js\.
4. sources\.js queries __enabled, configured__ Stremio\-protocol add\-ons, Express provider adapters, and connected Premiumize/TorBox cloud libraries\. Queries are parallelized so an individual provider error does not have to block the others\.
5. Results are normalized with filename/release parsing, resolution, size, codecs/tags where inferable, episode matches, and provider information\.
6. app/lib/compat\.js classifies evidence for browser playback; the app deliberately distinguishes __Plays in Chrome__, __Format unknown__, and __Won't play here__ rather than claiming all MP4 files work\.
7. A chosen source is resolved to a usable direct URL __where supported__, then handed to app/ui/player\.js\.
8. Browser\-compatible URLs play through HTML5 media; HLS uses bundled hls\.js where appropriate\. Movie playback can report progress and Trakt scrobbles\.

__Important limitations:__ File names only provide a heuristic for audio/video support; actual codecs may differ\. Direct providers can require authentication or headers\. URLs can expire\. CORS restrictions, browser media support and provider limitations still apply\. Source/provider configuration must only target services and content the user is authorized to access\.

## <a id="_hsi7hzia9zr9"></a>5\. Live TV implementation

app/lib/iptv\.js stores an IPTV account configuration and obtains channels/categories through a player API \(for example get\_live\_categories and get\_live\_streams\), with short EPG lookups through get\_short\_epg\. Account\-specific user preferences include favorites, recent channels and hidden categories\. Source URLs are built from the configured server plus channel ID and account data\.

app/ui/live\-player\.js handles browser\-based playback\. Version 1\.2 introduced a freeze/startup watchdog and finite reconnect behavior\. As documented in CHANGELOG\-BeaconHub\-1\.2\.md:

- Watchdog checks at about 2\-second intervals; around 10\-second apparent freeze / 20\-second startup timeout\.
- Up to three controlled reconnect attempts with short delays rather than endless reconnect loops\.
- User pause is not treated as a freeze; after extended pause, resume targets live\.

These numbers describe current intended behavior and should be confirmed during runtime testing\.

## <a id="_73p28quixhwm"></a>6\. Trakt authentication and data

app/lib/trakt\.js implements Trakt API access using __OAuth authorization\-code flow with PKCE__ through Chrome's identity API / redirect URL, and handles access\-token refresh, connection state and user\-data sync\. Trakt identity and tokens are stored using chrome\.storage\.local through the secrets interface in app/lib/store\.js\.

The current build contains a configured Trakt Client ID\. The regular Settings interface does __not__ expose a field where every friend can simply enter a replacement Client ID\. The correct first step for another tester is to connect __their own Trakt user account__ using the existing authorization flow\. If that flow is invalid or the tester must use their own Trakt developer app, source/config changes and properly matched OAuth redirects may be required\. Do not copy another user's Trakt OAuth tokens\.

Trakt may provide lists, watch status, collection/history, season metadata and scrobbling, subject to API support and account permissions\. Inspect implementation carefully before claiming a particular list sync is bidirectional or instantaneous\.

## <a id="_5g4z782yf0am"></a>7\. Premiumize / TorBox / source providers

- app/lib/premiumize\.js: account API key management and cloud\-file integration\.
- app/lib/torbox\.js: account API key management, cached files and authorized links\.
- app/lib/sources\.js: configuration for Stremio\-protocol add\-ons \(stored under key beacon:stremio:addons:v1\) and standardized provider results\.
- express\.js: configurable Express provider adapters; do not interpret a configured provider or failed test as proof any particular site is supported\.
- resolver\.js: older/additional resolver behavior; review whether code paths still call it before changes\.

Never embed actual account keys, passwords, session cookies, or credential\-bearing provider URLs in documentation, test fixtures, public repositories or a shared extension ZIP\.

## <a id="_m5c70bklx7j3"></a>8\. The VLC \.m3u feature added in 1\.2\.1

__Files changed/additional relevant:__ app/lib/vlc\-playlist\.js, app/ui/player\.js, version metadata in manifest\.json, and CHANGELOG\-BeaconHub\-1\.2\.1\.md\.

Current user flow:

1. A user selects and/or begins an authorized stream in Beacon's browser player\.
2. From the player Playback menu \(three dots\), select __Download VLC playlist \(\.m3u\)__; the player error UI also offers it\.
3. app/ui/player\.js passes the active resolved media URL plus a display title to downloadVlcPlaylist\(\.\.\.\)\.
4. app/lib/vlc\-playlist\.js constructs an \.m3u playlist in memory \(an \#EXTM3U header, media title metadata and the direct stream URL\) and invokes a local browser download using a Blob URL and temporary anchor\.
5. Chrome saves the small playlist file\. The user clicks the downloaded file; Windows opens VLC __if VLC is associated with \.m3u__\. VLC then requests and decodes the direct media URL\.
6. The user may delete the \.m3u afterward; it may contain a temporary or account\-linked access URL\.

__It does not silently launch VLC\.__ There is __no Chrome Native Messaging__ registration, Windows protocol handler, direct process execution or new Chrome permission\. The older __Copy active link for VLC__ remains available, and in\-browser playback remains intact\.

Failure modes to handle: missing/invalid resolved URL; non\-HTTP\(S\) source; expired authorization URL; unsupported provider authentication; filename sanitation; an \.m3u default association that opens a different program; IT download policy\. The playlist is not the movie file\. Downloading/launching may still be visible in managed\-device logs\.

## <a id="_q4kqen85vz9v"></a>9\. Persistence, backups and security boundaries

- app/lib/store\.js uses extension\-private chrome\.storage\.local for Trakt OAuth secrets and provides other local persistence helpers\. Additional settings, provider configs and IPTV preferences use browser local/session storage \(inspect individual files for exact keys\)\.
- backup\.js creates settings JSON exports\. It optionally includes selected account keys and IPTV credentials when the user explicitly chooses that option\.
- When including secrets, backup\.js derives an AES\-GCM 256\-bit encryption key with PBKDF2\-SHA256 \(250,000 iterations\) and a random salt and IV, requiring a passphrase of at least 12 characters\. The backup is decrypted on import\.
- This encryption is __for the exported backup file__; do not assume that every local credential is encrypted at rest inside the browser\.
- The backup does __not__ include a cloneable Chrome browser profile or all Trakt OAuth state\. Trakt must be authorized separately on another machine\.
- Exporting settings without explicit secret inclusion does not guarantee an arbitrary add\-on URL cannot embed an access token\. Review exported configurations before sending\.
- The manifest\.json currently requests all HTTP/HTTPS host access, which is a broad permission and should be reevaluated before public distribution\.
- Browser extension IDs and chrome\.identity callback URLs can differ between installations, especially unpacked installs\. Test OAuth behavior under a stable extension ID rather than guessing\.
- Never share live tokens, cookies, user passwords, or full sensitive server URLs with a model or put them into this blueprint\.

## <a id="_93ffilr9l3we"></a>10\. Network and VPN behavior

app/lib/netcheck\.js requests a public IP\-information endpoint and reports address/region/network plus a heuristic matching possible VPN/datacenter names\. app/ui/netcheck\-ui\.js displays it\. The result can suggest a VPN endpoint but __cannot establish that every IPTV or media stream traversed the same VPN__\.

Do not claim the extension conceals remote streaming destinations\. Direct playback may contact the actual media host\. Nothing in 1\.2\.1 is a tunnel, reverse proxy, media relay or traffic\-obfuscation mechanism\. Follow applicable workplace and network policies\.

## <a id="_1gh5rdv9fqa"></a>11\. Build / install / reproduce

This is presently an __unpacked JavaScript/CSS/HTML Chrome extension__, with no general compile step evident in the released package\.

1. Preserve Beacon\-Hub\-1\.2\.1\-VLC\.zip unchanged as the baseline\.
2. Extract into an isolated source folder\. Ensure manifest\.json is in the directory selected for loading\.
3. Review source references and preserve vendor/hls\.min\.js plus its license, assets/, icons/, app/, main scripts and supporting files\.
4. Run static checks \(JSON parse manifest\.json; node \-\-check on suitable JS files; verify ES module imports resolve; validate all required paths; scan for accidentally embedded credentials\)\. Static checks alone do not prove Chrome functionality\.
5. Open chrome://extensions, enable Developer mode, choose __Load unpacked__, and select the extension root folder\.
6. Click the toolbar extension icon; verify the full\-tab beacon\.html opens\.
7. Test routing, accounts, Trakt OAuth, IPTV lists/EPG, Premiumize/TorBox, search, source selection, Chrome playback and \.m3u export with user\-authorized test streams\.
8. To test \.m3u, pick a valid direct URL, select __Download VLC playlist__, verify the file contains the correct URL, then click the file and check that installed VLC plays it with audio\.
9. Verify warnings/error paths, reconnection limits and settings backup/import separately\.
10. Package a __new versioned ZIP__ without overwriting prior source\. Zip integrity and static tests are necessary but not sufficient; perform actual browser smoke tests\.

__Do not copy Chromium profile databases or signed\-in browser sessions as a distribution mechanism\.__ If friends test it, provide clean source plus a separate encrypted settings export where authorized, and have each tester connect Trakt independently\.

## <a id="_m6nzogxsgekt"></a>12\. Acceptance checklist for any Claude modifications

- Existing UI/navigation and visual design remain intact unless explicitly requested\.
- No loss of IPTV live channels, favorites, EPG or source search\.
- Premiumize/TorBox/Trakt authorization still works where configured\.
- Trakt token refresh / reconnect behavior is preserved\.
- Search does not mark content as watched\.
- Browser codec labels keep Unknown separate from supported/incompatible\.
- Browser video and HLS playback are unaffected\.
- Live TV reconnect remains finite, without false reconnect on user pause\.
- __Download VLC playlist \(\.m3u\)__ remains in the Playback menu and error UI\.
- \.m3u uses the currently selected direct URL; there is no Native Messaging or new permission without explicit approval\.
- Secret\-bearing URLs are not logged, exported unencrypted or inserted into public reports\.
- Backup/import round\-trip works, including separate Trakt sign\-in expectations\.
- ZIP/manifest/files pass static integrity checks and test Chrome load/unload\.
- Version incremented appropriately and original 1\.2\.1 source retained\.

## <a id="_syy1r65nicql"></a>13\. Guidance to Claude

__Treat this document as an orientation map, and the attached extension ZIP as the source of truth\.__ Before changing code, inspect manifest\.json, beacon\.html, app/ui/main\.js, relevant feature modules, backup\.js, and the current changelogs\. Propose a minimal diff, identify any affected storage keys or permissions, implement on a copy, test it, and produce a separate versioned ZIP and changelog\.

Do __not__ silently convert the current extension into a cloud app\. A cloud version is a separate project requiring explicit decisions about authentication, server\-side token storage, allowed media delivery, database sync, provider restrictions, cost, privacy, and deployment\.

### <a id="_btu5i6al2ms6"></a>Reference changelogs within the ZIP

- CHANGELOG\-BeaconHub\-1\.0\.md — initial full\-tab hub and connected sources\.
- CHANGELOG\-BeaconHub\-1\.1\.md — earlier iteration changes\.
- CHANGELOG\-BeaconHub\-1\.2\.md — compatibility labels, live watchdog, network check\.
- CHANGELOG\-BeaconHub\-1\.2\.1\.md — VLC playlist addition\.

__Implementation verification:__ This document was derived by inspecting the archived source structure, manifest, bootstrapping scripts, modules and packaged changelogs\. It is not a claim that every third\-party integration has been tested live\.

