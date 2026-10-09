Beacon 3.0.2 — TorBox playback authentication fix

TorBox GET /torrents/requestdl requires a token query parameter, unlike other authenticated TorBox endpoints. This update adds it to that endpoint only.

INSTALL: Back up your working extension folder, overwrite the app files with these files, then click Reload at chrome://extensions. Do not remove the extension.

TEST: Use a source you are authorized to access. Select TorBox, then Get playable link. Playback may be constrained by cloud processing status and browser codec support.

SECURITY: Do not paste or share API keys, request URLs containing tokens, or signed media links. Credentials remain in local Chrome storage from prior builds.
