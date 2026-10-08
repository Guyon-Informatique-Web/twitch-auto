# Twitch Auto

[Francais](README.md) - **English**

Chrome extension (Manifest V3) that automates Twitch: auto-claim of **channel points** and **drops**, **multi-tab background farming**, auto player reload, and many AFK helpers. All inside a clean 4-tab popup.

> **Personal** use. Loaded in developer mode (not published on the Chrome Web Store).

![Twitch Auto popup preview](assets/popup.png)

## Features

- **Channel points**: claims bonus chests automatically (the actual gain is counted).
- **Drops**: auto-claim via the inventory AND via the banner that appears on a stream. A drop Twitch refuses (game account to link) is neither counted nor clicked in a loop, and neither is a drop whose claim fails: no failed drop goes into the counters or the history, and it is not retried for 60 min (setting "Failed drop: try again after (min)", 1 to 1440; the delay is shared by all Twitch tabs; a reset clears it). A notification tells you to link the game account.
- **Multi-tab farming**: drops progress on ALL open tabs in parallel (not only the active one), and background videos no longer pause.
- **Auto reload** of the player on error (with an anti-loop guard).
- **Min quality** (160p) on background tabs, even for a stream already playing (live switch of the player), and your quality comes back when you return to the tab, including a tab reloaded or opened in the background meanwhile (a video you pause is never restarted); **mute** of background tabs (a tab you muted yourself stays muted), **anti-AFK** ("still watching" / mature content gates), **anti-pause**.
- **Stuck drop alert**: if a drop has not moved for 30 min while you watch a channel of ITS game (channel not part of the campaign, raid), an alert in Stats (counted in the header pill) and a notification. A campaign you set aside, whose game you do not watch, is never reported.
- **Participating channels**: a button per campaign opens a live channel that has drops enabled for that game (even with the extension switched off); as an option ("Auto drops channel"), the extension opens one by itself when a drop is stuck (in the background, with a notification: Chrome only starts the video once the tab has been shown).
- **Campaign end**: when the inventory gives the end date, each campaign shows the time left, compared with the watch time still needed ("too tight" in orange).
- **Tracking**: watch time, drops in progress with % and **estimated time remaining (ETA)**, per-channel stats, history. The Stats tab highlights the **next drop** (the one landing first).
- **Sorted by game and campaign**: drops in progress are grouped by game, then by campaign. The **history** is sorted **by day** (Today, Yesterday...) with the exact time, and each drop's game and campaign in full on a second line.
- **"Live" tab**: one card per open Twitch tab, with its real state (live / paused / frozen / offline / needs reload / inventory), the quality actually decoded (160p, 720p...), mute and time spent on the channel. **Go to tab**, **Reload** (when the player is frozen, or when the tab "needs reload" because the extension was reloaded after it opened) and **Close** buttons; **Reload all** when several tabs need a reload. After an update, background Twitch tabs are reloaded automatically ("Reload after update" option; never the tab you are watching, nor a background tab you are listening to, nor a page where you might be typing something: settings, subscriptions, payment, login, messages). A pill in the header shows how many tabs are farming, or how many alerts (tabs in trouble and stuck drops).
- **Notifications**, **backup** (export/import of settings, counters and history; the file is filtered on import), **auto-update**, **auto inventory**, **auto-switch** to an ordered list of fallback channels (5 at most: it moves on to the next one if it is offline, never back to the start of the list).
- **Bilingual interface (FR / EN)**: language picker with flags in the settings tab; the popup and desktop notifications follow your choice (auto-detected from your browser by default).

## Installation

1. Download the latest version: [Releases](https://github.com/Guyon-Informatique-Web/twitch-auto/releases/latest) (unzip the archive), or clone this repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode** (top right).
4. Click **"Load unpacked"** and select the extension folder.
5. Pin the icon, open Twitch: it is active.

## Usage

- Click the icon -> 4-tab popup: **Stats** (next drop, counters, top channels), **Live** (state of every open Twitch tab), **History**, **Settings** (enable/disable each feature, language, backup).
- **To farm drops hands-free**: keep a tab open on `twitch.tv/drops/inventory` **in the background**. The extension refreshes it on its own and claims completed drops. (Or enable the "Auto inventory" option, which does it for you.)
- Drops progress across all your open stream tabs in parallel.

## Updates

The extension automatically checks whether a newer version exists and shows it in the popup (banner + "Download update" button). To update: download the latest release, replace the folder, then reload the extension on `chrome://extensions`.

Thanks to the ID key pinned in the manifest, storage (counters, history) is kept from one update to the next.

## Development and maintenance

- **No build step**: vanilla HTML/CSS/JS, loadable as-is.
- **All Twitch selectors** are centralized in `src/content/selectors.js`: this is the only file to fix when Twitch changes its interface.
- **UI strings** are centralized in `src/shared/i18n.js` (FR / EN dictionary): the only file to edit to adjust or add a translation.
- **Diagnostics**: the "Test selectors" button (Settings tab), run on a Twitch page, shows what the extension finds.
- **Tests** (11 Node suites, no dependency): `for f in test/*.test.js; do node "$f"; done`.
- **Checks in real Chrome** (no dependency, Google Chrome stable required): `node tools/verifier.js` renders every popup tab in FR and EN and looks for overflow and errors; `--live` plays a real twitch.tv stream (playback, muting in the background, offline channel); `--popup-reel` opens the real toolbar popup. Screenshots and report in `tools/verif/<date>/` (not versioned).

## License

**Personal and free** use allowed. Modifying, redistributing, hosting elsewhere or reselling this software without the author's written consent is **prohibited**. See [LICENSE](LICENSE). All rights reserved - Valentin Guyon (Guyon Informatique & Web).

## Credits

Icons: [Lucide](https://lucide.dev) / [Feather](https://feathericons.com) (ISC / MIT licenses).

## Support the project

Twitch Auto is free. If the extension is useful to you, you can support its development on Ko-fi: **[ko-fi.com/vguyondev](https://ko-fi.com/vguyondev)** &#10084;

## Disclaimer

Automating Twitch (auto-claim of points/drops) is a gray area of Twitch's terms of service. This tool works by simulating clicks in the page (no private API), which limits the risk, but with no guarantee whatsoever. Use at your own risk.

---

Version history: [CHANGELOG.md](CHANGELOG.md)
