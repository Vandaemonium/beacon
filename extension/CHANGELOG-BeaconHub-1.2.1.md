# Beacon Hub 1.2.1 — VLC playlist support

- Added **Download VLC playlist (.m3u)** to the player Playback menu and player error screen.
- Playlist contains the *original resolved stream URL* so VLC can handle formats not supported by Chrome.
- Does not require Chrome Native Messaging, a protocol handler, or any additional extension permissions.
- Does not automatically launch VLC: open the downloaded `.m3u` file; set VLC as the file association if needed.
- Kept existing **Copy active link for VLC** and all in-browser playback behavior.
- The playlist may include temporary or account-linked media URLs. Delete it when finished. Depending on the service, stream URLs may expire.
- No changes to cloud hosting, IPTV/Trakt/Premiumize accounts, or Windows installations.
