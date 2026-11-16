// Shared by the content script and the options page.
(() => {
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const MOD = isMac ? 'meta' : 'ctrl'; // Sheets' own "command" modifier

  // Action catalog. `menu` = path through the Sheets menus (labels, English UI).
  // A segment written as /regex/ is matched as a regular expression, otherwise as a prefix.
  // `keys` = a native Sheets shortcut that gets re-sent. `native` = the chord Sheets already
  // listens to; a binding with exactly that chord is passed through untouched.
  const ACTIONS = {
    insertRowAbove: { label: 'Insert row above', menu: ['Insert > Rows > /^Insert \\d+ rows? above/'] },
    insertRowBelow: { label: 'Insert row below', menu: ['Insert > Rows > /^Insert \\d+ rows? below/'] },
    insertColLeft: { label: 'Insert column left', menu: ['Insert > Columns > /^Insert \\d+ columns? left/'] },
    insertColRight: { label: 'Insert column right', menu: ['Insert > Columns > /^Insert \\d+ columns? right/'] },
    deleteRow: { label: 'Delete row', menu: ['Edit > Delete > /^Rows? \\d/'] },
    deleteCol: { label: 'Delete column', menu: ['Edit > Delete > /^Columns? [A-Z]/'] },
    insertNative: { label: 'Insert (rows/columns of selection)', keys: { key: '=', code: 'Equal', keyCode: 187, [MOD]: true, alt: true } },
    deleteNative: { label: 'Delete (rows/columns of selection)', keys: { key: '-', code: 'Minus', keyCode: 189, [MOD]: true, alt: true } },
    selectRow: { label: 'Select row', keys: { key: ' ', code: 'Space', keyCode: 32, shift: true }, native: 'Shift+Space' },
    selectCol: { label: 'Select column', keys: { key: ' ', code: 'Space', keyCode: 32, ctrl: true }, native: 'Ctrl+Space' },
    prevSheet: { label: 'Previous sheet tab', keys: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38, alt: true } },
    nextSheet: { label: 'Next sheet tab', keys: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, alt: true } },
    goHome: { label: 'Jump to A1', keys: { key: 'Home', code: 'Home', keyCode: 36, [MOD]: true } },
    goEnd: { label: 'Jump to end of sheet', keys: { key: 'End', code: 'End', keyCode: 35, [MOD]: true } },
    goToRange: { label: 'Go to range', keys: { key: 'g', code: 'KeyG', keyCode: 71, ctrl: true }, native: 'Ctrl+G' },
    zoomIn: { label: 'Zoom in', zoom: 'in' },
    zoomOut: { label: 'Zoom out', zoom: 'out' },
    zoom100: { label: 'Zoom 100%', menu: ['View > Zoom > 100%'] },
    zoomMenu: { label: 'Open zoom menu', menu: ['View > Zoom'] },
    freezePanes: { label: 'Freeze panes at cursor', menu: ['View > Freeze > /^Up to row/', 'View > Freeze > /^Up to column/'] },
    freezeTopRow: { label: 'Freeze top row', menu: ['View > Freeze > 1 row'] },
    freezeFirstCol: { label: 'Freeze first column', menu: ['View > Freeze > 1 column'] },
    unfreeze: { label: 'Unfreeze panes', menu: ['View > Freeze > No rows', 'View > Freeze > No columns'] },
    pasteValues: { label: 'Paste special: values', menu: ['Edit > Paste special > Values only'] },
    pasteFormat: { label: 'Paste special: format', menu: ['Edit > Paste special > Format only'] },
    pasteFormulas: { label: 'Paste special: formulas', menu: ['Edit > Paste special > Formula only'] },
    pasteColWidths: { label: 'Paste special: column widths', menu: ['Edit > Paste special > Column width only'] },
    pasteTransposed: { label: 'Paste special: transposed', menu: ['Edit > Paste special > Transposed'] },
    pasteNoBorders: { label: 'Paste special: all except borders', menu: ['Edit > Paste special > All except borders'] },
    pasteAll: { label: 'Paste', paste: true },
    pasteValidation: { label: 'Paste special: data validation', menu: ['Edit > Paste special > Data validation only'] },
    pasteCondFormat: { label: 'Paste special: conditional formatting', menu: ['Edit > Paste special > Conditional formatting only'] },
    pasteSpecialDialog: { label: 'Paste special (popup)', dialog: 'pasteSpecial' },
  };

  const seq = (keys, action) => ({ type: 'seq', keys, action, enabled: true });
  const chord = (keys, action) => ({ type: 'chord', keys, action, enabled: true });

  const DEFAULT_CONFIG = {
    version: 6,
    trigger: { key: 'Alt+Control', taps: 1 }, // key: one key name, or several joined with +
    timeoutMs: 6000,
    swapCmdCtrl: false, // Cmd and Ctrl are interchangeable
    bindings: [
      seq('H I R', 'insertRowAbove'),
      seq('I R', 'insertRowAbove'),
      seq('H I C', 'insertColLeft'),
      seq('I C', 'insertColLeft'),
      seq('H D R', 'deleteRow'),
      seq('H D C', 'deleteCol'),
      chord('Ctrl+Shift++', 'insertNative'),
      chord('Ctrl++', 'insertNative'),
      chord('Ctrl+-', 'deleteNative'),
      chord('Shift+Space', 'selectRow'),
      chord('Ctrl+Space', 'selectCol'),
      chord('Ctrl+PageUp', 'prevSheet'),
      chord('Ctrl+PageDown', 'nextSheet'),
      chord('Ctrl+Home', 'goHome'),
      chord('Ctrl+End', 'goEnd'),
      chord('F5', 'goToRange'),
      chord('Ctrl+G', 'goToRange'),
      seq('W Q', 'zoomMenu'),
      seq('W J', 'zoom100'),
      chord('Ctrl+Alt+=', 'zoomIn'),
      chord('Ctrl+Alt+-', 'zoomOut'),
      chord('Cmd++', 'zoomIn'),
      chord('Cmd+=', 'zoomIn'),
      chord('Cmd+-', 'zoomOut'),
      seq('W F F', 'freezePanes'),
      seq('W F R', 'freezeTopRow'),
      seq('W F C', 'freezeFirstCol'),
      seq('W F U', 'unfreeze'),
      seq('E S', 'pasteSpecialDialog'),
      chord('Ctrl+Alt+V', 'pasteSpecialDialog'),
      chord('Alt+Cmd+V', 'pasteSpecialDialog'),
      chord('Ctrl+Cmd+V', 'pasteSpecialDialog'), // Excel for Mac
    ],
  };

  const CODE_NAMES = {
    Space: 'Space', Equal: '=', Minus: '-', Comma: ',', Period: '.', Slash: '/', Semicolon: ';',
    BracketLeft: '[', BracketRight: ']', Backquote: '`', Backslash: '\\', Quote: "'",
    NumpadAdd: '+', NumpadSubtract: '-',
  };
  const KEY_NAMES = {
    ' ': 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
    Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
    Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete',
  };

  // One key as a token. Uses the printed character so non-US layouts work; falls back to the
  // physical key when Option is held (Option changes the character on a Mac).
  function tokenFromEvent(e) {
    if (/^F\d{1,2}$/.test(e.key)) return e.key;
    if (KEY_NAMES[e.key]) return KEY_NAMES[e.key];
    if (e.altKey || e.key.length !== 1) {
      const m = /^(?:Key([A-Z])|Digit(\d)|Numpad(\d))$/.exec(e.code);
      if (m) return m[1] || m[2] || m[3];
      return CODE_NAMES[e.code] || null;
    }
    return e.key.toUpperCase();
  }

  // swap = read Cmd as Ctrl and Ctrl as Cmd
  function chordFromEvent(e, swap = false) {
    const tok = tokenFromEvent(e);
    if (!tok) return null;
    const mods = [];
    if (swap ? e.metaKey : e.ctrlKey) mods.push('Ctrl');
    if (e.altKey) mods.push('Alt');
    if (e.shiftKey) mods.push('Shift');
    if (swap ? e.ctrlKey : e.metaKey) mods.push('Cmd');
    return [...mods, tok].join('+');
  }

  // A press counts as a chord (not a sequence letter) if it has a real modifier or is a function/nav key.
  function isChordPress(e) {
    const tok = tokenFromEvent(e);
    if (!tok) return false;
    if (e.ctrlKey || e.metaKey || e.altKey) return true;
    if (/^F\d{1,2}$/.test(tok) || ['Home', 'End', 'PageUp', 'PageDown'].includes(tok)) return true;
    return e.shiftKey && tok === 'Space';
  }

  function normalize(c) {
    const d = DEFAULT_CONFIG;
    if (!c || !Array.isArray(c.bindings)) return structuredClone(d);
    let bindings = c.bindings.filter((b) => b && typeof b.keys === 'string' && typeof b.action === 'string');
    if ((c.version || 1) < 2) {
      // v2: paste special became a popup behind "E S"
      bindings = bindings.filter((b) => !(b.type === 'seq' && /^E S /.test(b.keys) && /^paste/.test(b.action)));
      bindings.forEach((b) => { if (b.action === 'pasteSpecialMenu') b.action = 'pasteSpecialDialog'; });
      if (!bindings.some((b) => b.type === 'seq' && b.keys === 'E S')) bindings.push(seq('E S', 'pasteSpecialDialog'));
    }
    const trigger = { key: c.trigger?.key || d.trigger.key, taps: c.trigger?.taps === 2 ? 2 : 1 };
    // v3: a tap on Ctrl starts a sequence too
    if ((c.version || 1) < 3 && trigger.key === 'Alt' && trigger.taps === 1) trigger.key = 'Alt+Control';
    let timeoutMs = Number(c.timeoutMs) > 0 ? Number(c.timeoutMs) : d.timeoutMs;
    if ((c.version || 1) < 4 && timeoutMs === 3000) timeoutMs = 6000; // v4: more time to read the keys
    if ((c.version || 1) < 5) {
      // v5: Cmd + and Cmd - zoom, also when Cmd and Ctrl are interchangeable
      for (const [k, a] of [['Cmd++', 'zoomIn'], ['Cmd+=', 'zoomIn'], ['Cmd+-', 'zoomOut']]) {
        if (!bindings.some((b) => b.type === 'chord' && b.keys === k)) bindings.push(chord(k, a));
      }
    }
    if ((c.version || 1) < 6) {
      // v6: the Mac ways to open paste special
      for (const k of ['Alt+Cmd+V', 'Ctrl+Cmd+V']) {
        if (!bindings.some((b) => b.type === 'chord' && b.keys === k)) bindings.push(chord(k, 'pasteSpecialDialog'));
      }
    }
    return {
      version: 6,
      trigger,
      timeoutMs,
      swapCmdCtrl: !!c.swapCmdCtrl,
      bindings,
    };
  }

  const hasChromeStorage = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync;

  async function loadConfig() {
    if (hasChromeStorage) return normalize((await chrome.storage.sync.get('config')).config);
    try { return normalize(JSON.parse(localStorage.getItem('sek-config'))); } catch { return normalize(null); }
  }
  async function saveConfig(c) {
    if (hasChromeStorage) return chrome.storage.sync.set({ config: c });
    localStorage.setItem('sek-config', JSON.stringify(c));
  }
  function onConfigChange(fn) {
    if (!hasChromeStorage) return;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes.config) fn(normalize(changes.config.newValue));
    });
  }

  function triggerLabel(t) {
    const name = { Alt: isMac ? '⌥' : 'Alt', 'Alt+Control': isMac ? '⌥' : 'Alt', Control: 'Ctrl', Shift: 'Shift' }[t.key] || t.key;
    return t.taps === 2 ? `${name} ${name}` : name;
  }
  function actionLabel(id) {
    if (id.startsWith('menu:')) return id.slice(5);
    return ACTIONS[id]?.label || id;
  }

  globalThis.SEK = {
    isMac, ACTIONS, DEFAULT_CONFIG, tokenFromEvent, chordFromEvent, isChordPress,
    loadConfig, saveConfig, onConfigChange, triggerLabel, actionLabel,
  };
})();
