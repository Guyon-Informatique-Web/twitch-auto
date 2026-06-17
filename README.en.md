# Twitch Auto

[Francais](README.md) - **English**

Chrome extension (Manifest V3) that automates Twitch: auto-claim of **channel points** and **drops**, **multi-tab background farming**, auto player reload, and many AFK helpers. All inside a clean 3-tab popup.

> **Personal** use. Loaded in developer mode (not published on the Chrome Web Store).

![Twitch Auto popup preview](assets/popup.png)

## Features

- **Channel points**: claims bonus chests automatically (the actual gain is counted).
- **Drops**: auto-claim via the inventory AND via the banner that appears on a stream.
- **Multi-tab farming**: drops progress on ALL open tabs in parallel (not only the active one), and background videos no longer pause.
- **Auto reload** of the player on error (with an anti-loop guard).
- **Min quality** (160p) and **mute** on background tabs, **anti-AFK** ("still watching" / mature content gates), **anti-pause**.
- **Tracking**: watch time, active tabs, drops in progress with % and **estimated time remaining (ETA)**, per-channel stats, history.
- **Notifications**, history **export**, **auto-update**, **auto inventory**, **auto-switch** to a fallback channel.
- **Bilingual interface (FR / EN)**: language picker with flags in the settings tab; the popup and desktop notifications follow your choice (auto-detected from your browser by default).

## Installation

1. Download the latest version: [Releases](https://github.com/Guyon-Informatique-Web/twitch-auto/releases/latest) (unzip the archive), or clone this repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode** (top right).
4. Click **"Load unpacked"** and select the extension folder.
5. Pin the icon, open Twitch: it is active.

## Usage

- Click the icon -> 3-tab popup: **Stats** (counters, tracking, drops in progress), **History**, **Settings** (enable/disable each feature).
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
- **Pure-function tests**: `node test/util.test.js`.

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
