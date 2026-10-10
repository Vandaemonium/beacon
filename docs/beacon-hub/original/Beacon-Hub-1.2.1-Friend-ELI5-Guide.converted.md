BEACON HUB

Friend’s First\-Time Setup & Testing Guide

Version 1\.2\.1 • Chrome extension • ELI5 \(no technical experience needed\)

Goal: install Beacon Hub, load shared provider settings, connect your own Trakt account, and test movies with Chrome or VLC\.

Allow about 20–40 minutes\. You do NOT need to purchase a domain or set up a cloud server for this test\.

# Before you start — what you need

- A Windows computer with Google Chrome and permission to load an unpacked extension\.
- Two ZIP files? The outer Friend Testing Package ZIP contains the inner Beacon\-Hub\-1\.2\.1\-VLC\.zip and setup notes\.
- A settings\-backup \.json file from your friend, if he exported one\. The ZIP alone does not contain his browser login data\.
- Your own Trakt account and access to the email associated with it\.
- VLC Media Player installed if you want to try VLC playback\.
- Any valid, authorized media\-provider account details, and the backup passphrase only if an encrypted backup was separately shared\.

IMPORTANT: Keep passwords, API keys, account\-linked URLs and backup passphrases private\. Never post screenshots showing them\. Use only accounts and content you are permitted to access\.

# Part 1 — Install Beacon Hub into Chrome

1. Download the file named Beacon\-Hub\-1\.2\.1\-Friend\-Test\-Package\.zip from the link your friend sends\.
2. Right\-click that file in Downloads and choose Extract All\. Open the extracted folder\.
3. Inside, find Beacon\-Hub\-1\.2\.1\-VLC\.zip\. Right\-click it and choose Extract All as well\.
4. Open the resulting folders until you see the Beacon\-Hub\-1\.2 folder\. You need the folder that directly contains the file manifest\.json\. Leave this folder somewhere permanent; do not delete it\.
5. Open Google Chrome\. In the address bar type chrome://extensions and press Enter\.
6. At the top right, turn ON Developer mode\.
7. Click Load unpacked\. Select the Beacon\-Hub\-1\.2 folder that contains manifest\.json, then choose Select Folder\.
8. You should see Beacon Hub in the list of extensions\. If Chrome displays a permissions request, review it before proceeding\.
9. Click the puzzle\-piece Extensions icon near Chrome’s address bar and pin Beacon Hub if desired\. Click its icon to open it\.

## If Chrome says “Manifest is missing”

You selected the wrong folder\. Click Load unpacked again and choose the inner folder that contains manifest\.json — not the ZIP, Downloads folder, or parent folder\.

# Part 2 — Bring in the shared settings \(optional\)

This is how you get the same vendor/provider setup and preferences without entering everything by hand\.

1. Ask your friend for a Beacon\-settings\-YYYY\-MM\-DD\.json backup\. Ask whether it is encrypted\.
2. In Beacon Hub, open the Media Hub / Accounts area and find Backup and restore settings\. The appearance may differ from the main Settings screen\.
3. Click the file chooser next to Import backup and select the \.json file\.
4. If it is an encrypted backup, enter the passphrase your friend gave you separately\.
5. Click Import backup and confirm\. Matching Beacon settings may be overwritten\.
6. Close and reopen Beacon Hub, or refresh it\. Confirm that your provider names, add\-ons and preferences now appear\.

IMPORTANT: A backup may contain account keys and saved IPTV logins only when the sender deliberately exported encrypted credentials\. It does not transfer browser cookies, VPN sessions or Trakt sign\-in tokens\. If a connection fails, use your own authorized credentials\.

# Part 3 — Connect Trakt \(the EASY path — try this first\)

Trakt is the service that tracks movies, TV shows, watchlists and episodes\. Having a Trakt account is different from having a Trakt developer application\.

1. Open Beacon Hub and click Settings \(gear icon\)\.
2. Find the Trakt section\. In this Beacon Hub 1\.2\.1 build, it says: “Client ID already configured for Beacon\.”
3. Click Connect Trakt\. A separate Trakt authorization/sign\-in window should open\.
4. Sign in using YOUR Trakt account \(not your friend’s\), and approve access only if you are comfortable with the permissions\.
5. Go back to Beacon Hub\. Your Trakt name/avatar or connected status should appear\.
6. Open My Lists or Home to see whether watchlists or other Trakt content load\.

IMPORTANT: If Connect Trakt works, STOP here — you do not need to create a developer application for this build\. Do not try to enter a Client Secret; PKCE does not require one\.

## If Trakt gives a redirect or authorization error

1. Write down the exact error message, but do NOT copy any access code, token or secret into a screenshot\.
2. On chrome://extensions, find Beacon Hub and click Details\. Copy the extension ID \(a long string of letters\)\.
3. Beacon Hub’s expected Trakt return address is in the format https://EXTENSION\-ID\.chromiumapp\.org/ \. Your newly installed unpacked extension can have a different ID than your friend’s\.
4. Tell your friend which error occurred\. A different extension ID may require a compatible, correctly registered Trakt application and update to the extension configuration\. Merely making a new app on Trakt does not automatically fix this version\.

# Part 4 — Trakt developer account \(OPTIONAL advanced step\)

Only do this if you want to register a separate permitted integration and Beacon Hub is updated/configured to use its Client ID\. Creating an app is NOT required just to have a Trakt account\.

1. Open https://developer\.trakt\.tv/docs/create\-an\-app in Chrome and read the latest instructions\.
2. Trakt currently requires a verified GitHub account to create a developer app\. If you do not have GitHub, create an account at https://github\.com/ and complete its verification steps\.
3. Sign into Trakt, open the developer panel / My Apps, and connect the verified GitHub account if Trakt asks\.
4. Choose the option to create a new API application\. Give it an accurate name and description \(for example, Personal Media Watchlist Companion\)\. Follow Trakt’s branding, app\-use and API policy\.
5. If the registration form requests a Redirect URI, use only the exact HTTPS callback the actual configured application uses\. For this Chrome extension, that is typically https://EXTENSION\-ID\.chromiumapp\.org/ — copying your friend’s extension ID may be wrong\.
6. Finish registration\. Trakt will show a Client ID\. Keep this for the app configuration; never publish a Client Secret\. PKCE sign\-in normally uses Client ID without a Client Secret\.
7. IMPORTANT: Beacon Hub 1\.2\.1 currently says its Client ID is already configured; it does not offer a normal user\-facing “paste new Client ID” field\. If you register your own app, the extension developer must first configure/build a compatible version before it can use your new Client ID\.

IMPORTANT: Trakt prohibits applications that promote copyright infringement or unauthorized distribution\. A developer account is not an authorization to access or redistribute media\. Check https://developer\.trakt\.tv/docs/api\-use\-policy \.

# Part 5 — Other accounts and media providers

1. Open Beacon Hub → Settings / Accounts\. Look for Premiumize, TorBox, IPTV or the vendor/add\-on sections you intend to use\.
2. If your imported backup did not include credentials, enter your own authorized service details\. For Premiumize, use the API key from your own Premiumize account and click Connect & test\.
3. For Live TV, enter the provider server URL, username and password only if you are permitted to use that account\.
4. Make sure the vendor/add\-on entries are visible, then try searching a movie or TV show\.
5. Do not assume that an installed vendor package guarantees a working stream; source availability can change\.

# Part 6 — Test a movie in Chrome and VLC

1. Find a movie you are authorized to play and select one available direct streaming source\.
2. Choose Play in Chrome first\. Check picture, sound, pause and seeking\.
3. If the movie has picture but no sound, open the player’s three\-dot / Playback menu and choose Download VLC playlist \(\.m3u\)\. The VLC option might also appear after a browser playback error\.
4. Chrome downloads a tiny \.m3u file \(this is NOT the movie\)\. Click that file in Chrome’s Downloads area\.
5. If asked “Open with,” choose VLC Media Player\. VLC reads the streaming URL and should start playback\. No copying/pasting the address is needed\.
6. When finished, close VLC\. Delete the downloaded \.m3u from Downloads if no longer needed; it may contain a temporary signed or credential\-linked streaming URL\.

IMPORTANT: This method uses a normal playlist download; it does not require Chrome Native Messaging\. On managed computers, follow local software/network rules\. Downloads, program launches and network activity may still be logged\.

# Part 7 — Quick test checklist

☐  Beacon Hub opens in Chrome

☐  Settings backup imported \(if provided\)

☐  Trakt connects to MY account

☐  My Lists displays items

☐  Provider/vender packages appear

☐  A movie source can be selected

☐  Chrome video/audio checked

☐  VLC playlist downloaded and played

☐  Saved \.m3u cleaned up after testing

# Part 8 — Common problems

## The extension will not install

Extract BOTH ZIP files and select the folder with manifest\.json\. Do not select a ZIP directly\.

## Trakt will not authorize

Record the exact error; the extension ID/registered HTTPS redirect and configured Client ID may not match\.

## Trakt shows another person’s history

Disconnect Trakt and sign in with your own account\.

## Vendor packages show, but no movie plays

Check source availability and account authorization\. Try another legitimately available source\.

## Chrome has video but no sound

Try the \.m3u VLC method; Chrome and VLC have different codec support\.

## VLC opens but says it cannot play

The URL may be expired, inaccessible, or require credentials/headers\. Go back to Beacon, fetch a fresh source and test again\.

## I moved/deleted the extension folder

Restore it to the original location or reinstall with Load unpacked\. Changing folder may change the unpacked extension identity\.

## Encrypted backup will not import

Confirm the exact JSON file and the separate backup passphrase with the sender\.

# After testing — what to tell the owner

Send a short report: Windows version; Chrome version; Beacon extension version; whether Trakt connected; whether imported vendors were visible; one movie that worked and one that failed; whether VLC had sound; and the exact error messages with all tokens/passwords hidden\.

Useful official references: https://developer\.trakt\.tv/docs/create\-an\-app  •  https://developer\.trakt\.tv/docs/pkce  •  https://developer\.trakt\.tv/docs/api\-use\-policy

