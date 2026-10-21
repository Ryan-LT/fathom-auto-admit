# Fathom Auto-Admit for Google Meet

Chrome extension that automatically admits your Fathom Notetaker bot from the Google Meet waiting room, so you never have to remember to let it in.

- Matches waiting guests whose name contains one of the configured names (default `Ryan's Fathom Notetaker`; change it in the popup).
- Handles both a normal **Admit** button and the **With potential risks** group, where Admit sits in the ⋮ menu and asks for confirmation.
- Opens the waiting list automatically when a "guests waiting" indicator appears, and closes it again afterwards if it opened it (can be turned off).
- Never touches other guests.

## Install locally

1. Clone this repo.
2. Open `chrome://extensions`, turn on **Developer mode**.
3. **Load unpacked** → select the repo folder.
4. Click the extension icon to set your bot's name.

## Publish to the Chrome Web Store

1. Build the upload zip from the repo root:
   ```bash
   zip -r fathom-auto-admit.zip manifest.json content.js popup.html popup.js icons
   ```
2. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) → **Add new item** → upload the zip.
3. **Store listing** tab:
   - Description: copy the intro above.
   - Category: Productivity / Tools.
   - Icon: `icons/icon128.png`.
   - At least one screenshot, 1280×800 or 640×400 (e.g. the popup over a Meet call).
4. **Privacy** tab:
   - Single purpose: "Automatically admits the user's own meeting-notetaker bot from the Google Meet waiting room."
   - `storage` justification: "Saves the user's settings (enabled flag and bot names to admit)."
   - Host permission (`https://meet.google.com/*`) justification: "Reads the Meet waiting list and clicks Admit for the configured bot."
   - Remote code: **No**.
   - Data usage: collects nothing; tick the three certification boxes.
   - Privacy policy URL: link to [`PRIVACY.md`](PRIVACY.md) in this repo.
5. **Distribution** tab: choose **Unlisted** (only people with the link can install) or **Private** (only your Google Workspace domain), unless you want it public.
6. **Submit for review**. Review usually takes 1–3 business days.

For updates, bump `version` in `manifest.json`, re-zip, then **Package → Upload new package** in the dashboard.
