# ARC Sheets Mouse Remover (ASMR)

A browser extension that lets you work in Google Sheets by keyboard, the way you do in Excel on Windows. Tap Option (Alt on Windows) and key tips appear on the toolbar. Type a letter and the button fires.

This is an early version. If something does not work in your Sheet, open an issue.

## Install

Works in Chrome and other Chromium browsers (Edge, Brave, Arc, Ardia).

1. On this page click **Code**, then **Download ZIP**.
2. Unzip the file and put the folder somewhere it can stay.
3. Open `chrome://extensions` in your browser.
4. Switch on **Developer mode** (top right).
5. Click **Load unpacked** and pick the unzipped folder.
6. Close any open Google Sheets tab and open it again.

To update, download the ZIP again, replace the folder, click the reload icon on the extension card and reopen your Sheets tab.

## How it works

| Press | What happens |
|---|---|
| Option, once | Key tips on the toolbar. Type the letter shown on a button. |
| Option, twice | Key tips on the menu bar (File, Edit, View and so on). |
| Esc | Closes the key tips. |

On Windows and Linux, Option is the Alt key.

A sequence stays open for 6 seconds while it waits for your next key. You can change that in the settings.

## Default shortcuts

Sequences start with a tap on Option, then the letters one after another.

| Keys | Action |
|---|---|
| `⌥ H I R` or `⌥ I R` | Insert row above |
| `⌥ H I C` or `⌥ I C` | Insert column left |
| `⌥ H D R` | Delete row |
| `⌥ H D C` | Delete column |
| `Ctrl +` | Insert rows or columns of the selection |
| `Ctrl -` | Delete rows or columns of the selection |
| `Shift Space` | Select row |
| `Ctrl Space` | Select column |
| `Ctrl PageUp` / `Ctrl PageDown` | Previous or next sheet tab |
| `Ctrl Home` / `Ctrl End` | Jump to A1 or to the end of the sheet |
| `F5` or `Ctrl G` | Go to range |
| `Cmd +` / `Cmd -` | Zoom the sheet in or out |
| `⌥ W J` | Zoom 100% |
| `⌥ W F F` | Freeze panes at the cursor |
| `⌥ W F R` / `⌥ W F C` | Freeze top row or first column |
| `⌥ W F U` | Unfreeze |
| `⌥ E S`, `⌥ ⌘ V` or `Ctrl Alt V` | Paste special dialog |

## Paste special

Copy a range, then open the dialog with `⌥ ⌘ V` (Mac) or `Ctrl Alt V`. Press the underlined letter of an option, then Enter. The layout follows the Excel dialog.

## Settings

Click the extension icon in the browser toolbar. There you can:

- change, add or switch off any shortcut
- choose which key starts a sequence
- make Cmd and Ctrl interchangeable, so `Ctrl C` and `Cmd C` both copy
- add your own shortcut for any menu entry, for example `Data > Create a filter`

## Privacy

The extension runs only on `docs.google.com/spreadsheets`. It reads no sheet content and sends nothing to any server. Your shortcut settings are stored in your browser's own sync storage. The clipboard permission is needed for paste.

## Known limits

- Google Sheets must be set to English. Menu actions are found by their English labels.
- The extension is not in the Chrome Web Store yet, so the browser shows a developer mode notice.
