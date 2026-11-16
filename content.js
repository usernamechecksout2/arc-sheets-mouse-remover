// Runs inside Google Sheets. Catches key presses and triggers the matching Sheets action.
(() => {
  if (window.top !== window) return;
  const S = globalThis.SEK;
  const MODIFIER_KEYS = new Set(['Alt', 'Control', 'Shift', 'Meta', 'AltGraph', 'CapsLock', 'Fn']);

  let cfg = structuredClone(S.DEFAULT_CONFIG);
  let seqMap = new Map(); // "H I R" -> binding
  let seqPrefixes = new Set(); // "H", "H I"
  let chordMap = new Map(); // "Ctrl+Shift++" -> binding

  function rebuild() {
    seqMap = new Map();
    seqPrefixes = new Set();
    chordMap = new Map();
    for (const b of cfg.bindings) {
      if (b.enabled === false || !b.keys) continue;
      if (b.type === 'chord') { chordMap.set(b.keys, b); continue; }
      seqMap.set(b.keys, b);
      const parts = b.keys.split(' ');
      for (let i = 1; i < parts.length; i++) seqPrefixes.add(parts.slice(0, i).join(' '));
    }
  }
  rebuild();
  S.loadConfig().then((c) => { cfg = c; rebuild(); });
  S.onConfigChange((c) => { cfg = c; rebuild(); cancelSeq(); closeDialog(); });

  // ---------- overlay ----------
  let box = null;
  let toastTimer = null;
  function ensureBox() {
    if (box && box.isConnected) return box;
    box = document.createElement('div');
    box.style.cssText = [
      'position:fixed', 'left:50%', 'bottom:56px', 'transform:translateX(-50%)', 'z-index:2147483647',
      'background:#1a1c1c', 'color:#f6f3ec', 'font:13px/1.5 system-ui,sans-serif', 'padding:10px 14px', 'box-sizing:border-box',
      'border-radius:10px', 'box-shadow:0 8px 28px rgba(0,0,0,.4)', 'max-width:92vw', 'display:none',
      'pointer-events:none', 'white-space:pre-wrap',
    ].join(';');
    (document.body || document.documentElement).appendChild(box);
    return box;
  }
  function show(text) { clearTimeout(toastTimer); const b = ensureBox(); b.textContent = text; b.style.width = 'auto'; b.style.display = 'block'; }
  function hide() { if (box) box.style.display = 'none'; }
  function toast(text, ms = 2200) { show(text); toastTimer = setTimeout(hide, ms); }

  // ---------- sequence mode ----------
  let seq = null; // array of tokens while a sequence is being typed
  let level = 'toolbar'; // 'toolbar' after one trigger tap, 'menu' (the menu bar) after a second one
  let seqTimer = null;
  const swallowed = new Set(); // codes whose keyup should not reach Sheets

  function kbd(text, dim) {
    return h('span', `display:inline-block;min-width:16px;text-align:center;padding:0 5px;margin-right:3px;border-radius:4px;font:600 11px/18px ui-monospace,Menlo,monospace;${dim ? 'color:#8a8a8a;box-shadow:inset 0 0 0 1px #4a4a4a' : 'background:#d1ff00;color:#1a1c1c'}`, text);
  }
  // Panel after the trigger tap: menu letters plus every sequence that is still reachable.
  function renderSeq() {
    clearTimeout(toastTimer);
    if (level === 'toolbar' && !seq.length) { hide(); return; } // the keys on the buttons say it all
    const b = ensureBox();
    const prefix = seq.join(' ');
    const rows = [...seqMap.keys()].sort()
      .filter((keys) => !prefix || keys.startsWith(prefix + ' '))
      .map((keys) => h('div', 'display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden',
        h('span', 'flex:none', ...keys.split(' ').map((k, i) => kbd(k, i < seq.length))),
        h('span', 'color:#d6d6d6;overflow:hidden;text-overflow:ellipsis', S.actionLabel(seqMap.get(keys).action))));
    const parts = [h('div', 'display:flex;align-items:center;margin-bottom:8px',
      kbd(S.triggerLabel(cfg.trigger)), ...seq.map((k) => kbd(k)),
      h('span', 'color:#8a8a8a;margin-left:6px', seq.length ? 'next key'
        : level === 'toolbar' ? `type the key on a toolbar button, ${S.triggerLabel(cfg.trigger)} again for the menus, Esc cancels` : 'type a menu letter, Esc cancels'))];
    if (!seq.length && level === 'menu') {
      const menus = availableMenus();
      if (menus.length) {
        parts.push(h('div', 'display:flex;flex-wrap:wrap;gap:4px 14px;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid #3a3a3a',
          h('span', 'color:#8a8a8a;margin-right:2px', 'Menus'),
          ...menus.map(([key, name]) => h('span', 'white-space:nowrap', kbd(key), name[0].toUpperCase() + name.slice(1)))));
      }
    }
    parts.push(h('div', 'display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:4px 18px', ...rows));
    b.replaceChildren(...parts);
    b.style.width = 'min(780px, 92vw)';
    b.style.display = 'block';
  }

  // Menu bar letters, as Sheets underlines them. After the trigger tap, a letter opens that menu.
  const MENU_KEYS = { F: 'file', E: 'edit', V: 'view', I: 'insert', O: 'format', D: 'data', T: 'tools', N: 'extensions', Y: 'help' };
  const HOME_KEY = 'H'; // like Excel's Home tab: prefix for a toolbar key that would collide with a sequence
  // Toolbar buttons get Excel's Home-tab keys where one exists. Matched against the button's tooltip.
  // Buttons that match nothing get X1, X2, ... so every button stays reachable.
  const TOOLBAR_KEYS = [
    [/^undo/i, 'Z'], [/^redo/i, 'Y'], [/^print/i, 'P'], [/^paint format/i, 'F'], [/^zoom/i, 'Q'],
    [/currency/i, '4'], [/per ?cent/i, '5'], [/^decrease decimal/i, '9'], [/^increase decimal/i, '0'], [/^more formats/i, 'N'],
    [/^decrease font size/i, '-'], [/^increase font size/i, '+'], [/^font size/i, 'S'], [/^font/i, 'T'],
    [/^bold/i, 'B'], [/^italic/i, 'K'], [/^underline/i, 'U'], [/^strike/i, 'X'],
    [/^text colou?r/i, 'A'], [/^(fill|highlight) colou?r/i, 'G'], [/^borders/i, 'R'], [/merge/i, 'M'],
    [/^vertical align/i, 'V'], [/align/i, 'L'], [/wrap/i, 'O'], [/rotat/i, 'D'],
    [/link/i, 'J'], [/comment/i, 'C'], [/chart/i, '1'], [/filter views/i, '3'], [/filter/i, '2'], [/^functions/i, '6'],
  ];
  let toolbarMap = new Map(); // key code -> toolbar button, built on the trigger tap

  function toolbarButtons() {
    const sel = '.goog-toolbar-button, .goog-toolbar-menu-button, .goog-toolbar-combo-button';
    const bar = document.getElementById('docs-toolbar') || document;
    return [...bar.querySelectorAll(sel)].filter((el) => visible(el) && !/-disabled\b/.test(el.className) && !el.parentElement.closest(sel));
  }
  function buildToolbarMap() {
    toolbarMap = new Map();
    const seqStarts = new Set([...seqMap.keys()].map((k) => k.split(' ')[0]));
    const known = new Set(TOOLBAR_KEYS.map(([, c]) => c));
    // Spare single keys for buttons without a fixed key.
    const spare = [...'78ABCDEFGHIJKLMNOPQRSTUVWXYZ'].filter((c) => !known.has(c) && !seqStarts.has(c));
    for (const el of toolbarButtons()) {
      const label = el.getAttribute('aria-label') || el.getAttribute('data-tooltip') || '';
      let code = (TOOLBAR_KEYS.find(([re]) => re.test(label)) || [])[1];
      // A sequence starting with the same letter wins; the button moves behind HOME_KEY.
      if (code && seqStarts.has(code)) code = HOME_KEY + code;
      if (!code || toolbarMap.has(code)) {
        if (!spare.length) continue;
        code = spare.shift();
      }
      toolbarMap.set(code, el);
    }
  }
  function showToolbarTips(typed) {
    for (const [code, el] of toolbarMap) if (code.startsWith(typed)) addTip(el, code);
  }
  const MENU_DELAY_MS = 350; // a letter that also starts a sequence opens its menu only after this pause
  let tips = [];
  let menuTimer = null;
  let pendingMenu = null; // menu waiting for MENU_DELAY_MS
  let openedTop = null; // menu bar button we opened during this sequence

  // Menus that are on screen and usable right now (the menu bar can be hidden, single menus disabled).
  function availableMenus() {
    return Object.entries(MENU_KEYS).filter(([, name]) => {
      const el = topButton(name);
      return el && visible(el) && !el.classList.contains('goog-control-disabled');
    });
  }
  function showTips() {
    for (const [key, name] of availableMenus()) addTip(topButton(name), key);
  }
  function addTip(el, key) {
    {
      const r = el.getBoundingClientRect();
      const tip = h('div', [
        'position:fixed', `left:${Math.round(r.left + r.width / 2 - 9)}px`, `top:${Math.round(r.bottom - 5)}px`,
        'z-index:2147483647', 'min-width:18px', 'text-align:center', 'padding:0 4px', 'border-radius:4px',
        'background:#1a1c1c', 'color:#d1ff00', 'font:600 11px/18px ui-monospace,Menlo,monospace',
        'box-shadow:0 1px 4px rgba(0,0,0,.4)', 'pointer-events:none',
      ].join(';'), key);
      (document.body || document.documentElement).appendChild(tip);
      tips.push(tip);
    }
  }
  function hideTips() {
    tips.forEach((t) => t.remove());
    tips = [];
  }
  function openTop(name) {
    const top = topButton(name);
    pendingMenu = null;
    if (!top) return;
    fire(top, ['mousedown', 'mouseup']);
    openedTop = top;
  }
  function closeOpenedTop() {
    if (openedTop) fire(openedTop, ['mousedown', 'mouseup']); // a second click closes it
    openedTop = null;
  }

  function startSeq(lvl) {
    seq = [];
    level = lvl;
    openedTop = null;
    if (level === 'toolbar') { buildToolbarMap(); showToolbarTips(''); } else showTips();
    renderSeq();
    armTimer();
  }
  function cancelSeq() {
    if (!seq) return;
    seq = null;
    clearTimeout(seqTimer);
    clearTimeout(menuTimer);
    pendingMenu = null;
    openedTop = null; // an open menu stays open and takes the keys from here on
    toolbarMap = new Map();
    hideTips();
    hide();
  }
  function armTimer() {
    clearTimeout(seqTimer);
    seqTimer = setTimeout(cancelSeq, cfg.timeoutMs);
  }
  function consume(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    swallowed.add(e.code);
  }

  function handleSeqKey(e) {
    if (e.key === 'Escape') { if (!openedTop) consume(e); cancelSeq(); return; } // an open menu closes itself on Esc
    const tok = S.tokenFromEvent(e);
    if (e.ctrlKey || e.metaKey || !tok || tok.length > 1) { cancelSeq(); return; } // let it through
    const next = [...seq, tok];
    const key = next.join(' ');
    const exact = seqMap.get(key);
    const menu = level === 'menu' && !seq.length && availableMenus().some(([k]) => k === tok) ? MENU_KEYS[tok] : null;
    const waiting = pendingMenu;
    clearTimeout(menuTimer);
    pendingMenu = null;
    hideTips();

    // Toolbar keys live behind HOME_KEY.
    let tbHit = null;
    let tbMore = false;
    const tbCode = level === 'toolbar' ? next.join('').replace('=', '+') : null;
    if (tbCode !== null) {
      tbHit = tbCode ? toolbarMap.get(tbCode) : null;
      tbMore = [...toolbarMap.keys()].some((c) => c !== tbCode && c.startsWith(tbCode));
    }

    if (exact) { consume(e); closeOpenedTop(); cancelSeq(); run(exact.action); return; }
    if (tbHit) {
      consume(e);
      cancelSeq();
      fire(tbHit, ['mouseenter', 'mouseover', 'mousemove', 'mousedown', 'mouseup']);
      return;
    }
    if (seqPrefixes.has(key) || tbMore) {
      consume(e);
      seq = next;
      renderSeq();
      armTimer();
      if (tbCode !== null) showToolbarTips(tbCode);
      if (menu) { pendingMenu = menu; menuTimer = setTimeout(() => openTop(menu), MENU_DELAY_MS); }
      return;
    }
    if (menu) { consume(e); openTop(menu); cancelSeq(); return; } // plain menu letter
    if (openedTop) { cancelSeq(); return; } // the open menu handles this key itself
    consume(e);
    if (waiting) { openTop(waiting); cancelSeq(); return; } // typed ahead of the menu: open it now
    cancelSeq();
    toast(`No shortcut: ${S.triggerLabel(cfg.trigger)} ${key}`);
  }

  // ---------- key listeners ----------
  let trigClean = false; // name of the trigger key that went down, while nothing else happened since
  let taps = 0;
  let lastTap = 0;

  const isTrigger = (key) => cfg.trigger.key.split('+').includes(key);
  function otherModifierHeld(e) {
    const t = e.key;
    return (e.altKey && t !== 'Alt') || (e.ctrlKey && t !== 'Control') || (e.shiftKey && t !== 'Shift') || e.metaKey;
  }

  window.addEventListener('keydown', (e) => {
    if (!e.isTrusted) return;
    if (isTrigger(e.key)) { if (!e.repeat) trigClean = otherModifierHeld(e) ? false : e.key; return; }
    trigClean = false;
    if (MODIFIER_KEYS.has(e.key)) return;
    if (dlg) { handleDialogKey(e); return; }
    if (seq) { handleSeqKey(e); return; }
    if (!S.isChordPress(e)) return;
    const pressed = S.chordFromEvent(e);
    const b = chordMap.get(pressed) || (cfg.swapCmdCtrl && chordMap.get(S.chordFromEvent(e, true)));
    if (b) {
      const spec = S.ACTIONS[b.action];
      if (spec && spec.native === pressed) return; // Sheets handles this one itself
      consume(e);
      run(b.action);
      return;
    }
    if (cfg.swapCmdCtrl) ctrlAsCmd(e);
  }, true);

  // Windows habit on a Mac: an unbound Ctrl+key is handed to Sheets as Cmd+key.
  function ctrlAsCmd(e) {
    if (!e.ctrlKey || e.metaKey || e.altKey) return;
    const tok = S.tokenFromEvent(e);
    if (!tok || (tok.length > 1 && tok !== 'Enter')) return;
    consume(e);
    // Copy, cut and paste belong to the browser, a simulated key press cannot trigger them.
    if (!e.shiftKey && (tok === 'C' || tok === 'X')) { document.execCommand(tok === 'C' ? 'copy' : 'cut'); return; }
    if (tok === 'V') {
      if (e.shiftKey) run('pasteValues');
      else run('pasteAll');
      return;
    }
    sendKeys({ key: e.key, code: e.code, keyCode: e.keyCode, meta: true, shift: e.shiftKey });
  }

  window.addEventListener('keyup', (e) => {
    if (!e.isTrusted) return;
    if (swallowed.delete(e.code)) { e.stopImmediatePropagation(); return; }
    if (trigClean !== e.key || dlg) return;
    trigClean = false;
    const now = Date.now();
    taps = now - lastTap < 400 ? taps + 1 : 1;
    lastTap = now;
    if (taps < cfg.trigger.taps) return;
    taps = 0;
    if (!seq) startSeq('toolbar');
    else if (level === 'toolbar' && !seq.length) { cancelSeq(); startSeq('menu'); } // second tap: one level up
    else cancelSeq();
  }, true);

  window.addEventListener('mousedown', (e) => {
    if (!e.isTrusted) return;
    trigClean = false;
    cancelSeq();
    if (dlg && !dlg.contains(e.target)) closeDialog();
  }, true);
  window.addEventListener('blur', () => { trigClean = false; cancelSeq(); }); // the popup stays: Sheets moves focus around when a menu closes

  // ---------- paste special popup (laid out like Excel's dialog) ----------
  // [label with & before the shortcut letter, action id or null where Sheets has no equivalent]
  const PASTE_RADIOS = [
    ['&All', 'pasteAll'],
    ['&Formulas', 'pasteFormulas'],
    ['&Values', 'pasteValues'],
    ['Forma&ts', 'pasteFormat'],
    ['&Comments and Notes', null],
    ['Validatio&n', 'pasteValidation'],
    ['All using Source t&heme', null],
    ['All e&xcept borders', 'pasteNoBorders'],
    ['Column &widths', 'pasteColWidths'],
    ['Formulas and numbe&r formats', null],
    ['Values and n&umber formats', null],
    ['All mer&ging conditional formats', 'pasteCondFormat'],
  ];
  const PASTE_OPERATIONS = ['N&one', 'A&dd', '&Subtract', '&Multiply', 'D&ivide']; // Sheets has none of these
  const keyOf = (label) => label[label.indexOf('&') + 1].toUpperCase();

  const C = { accent: '#2d4039', tint: '#eef0e7', text: '#1a1c1c', muted: '#525252', line: '#e5e5e5', chip: '#f6f3ec', ink: '#1a1c1c', lime: '#d1ff00', paper: '#f6f3ec' };
  let dlg = null; // backdrop
  let dlgCard = null;
  let dlgRadio = 0;
  let dlgTranspose = false;

  function h(tag, css, ...children) {
    const n = document.createElement(tag);
    if (css) n.style.cssText = css;
    n.append(...children);
    return n;
  }
  function chip(text, on) {
    return h('span', `flex:none;min-width:18px;text-align:center;padding:0 5px;border-radius:5px;font:600 11px/18px ui-monospace,Menlo,monospace;background:${on ? C.ink : C.chip};color:${on ? C.lime : C.muted}`, text);
  }
  function mark(kind, on) {
    const radio = kind === 'radio';
    const box = h('span', `display:inline-flex;align-items:center;justify-content:center;flex:none;width:14px;height:14px;box-sizing:border-box;border:1.5px solid ${on ? C.accent : '#9ca3af'};border-radius:${radio ? '50%' : '4px'};background:${on && !radio ? C.accent : '#fff'}`);
    if (on && radio) box.append(h('span', `width:6px;height:6px;border-radius:50%;background:${C.accent}`));
    if (on && !radio) box.append(h('span', 'font:700 10px/1 system-ui;color:#fff', '✓'));
    return box;
  }
  function option(kind, label, on, enabled, onClick) {
    const row = h('div', `display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:8px;white-space:nowrap;background:${on && enabled ? C.tint : 'transparent'};${enabled ? 'cursor:pointer' : 'opacity:.38'}`,
      mark(kind, on), h('span', 'flex:1', label.replace('&', '')), chip(keyOf(label), on && enabled));
    if (enabled) row.addEventListener('click', onClick);
    return row;
  }
  function group(title, ...children) {
    return h('div', 'margin:0 0 14px',
      h('div', `font:600 11px/1 system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:${C.muted};margin:0 8px 6px`, title),
      ...children);
  }
  function button(primary, enabled, onClick, ...children) {
    const b = h('div', `display:flex;align-items:center;gap:8px;padding:6px 12px;border-radius:8px;font-weight:600;${primary ? `background:${C.accent};color:#fff` : `background:#fff;box-shadow:inset 0 0 0 1px ${C.line}`};${enabled ? 'cursor:pointer' : 'opacity:.38'}`, ...children);
    if (enabled) b.addEventListener('click', onClick);
    return b;
  }

  function renderDialog() {
    const half = PASTE_RADIOS.length / 2;
    const grid = (rows) => `display:grid;grid-auto-flow:column;grid-template-rows:repeat(${rows},auto);grid-auto-columns:1fr;column-gap:12px`;
    const pasteGrid = h('div', grid(half),
      ...PASTE_RADIOS.map(([label, action], i) => option('radio', label, i === dlgRadio, !!action, () => { dlgRadio = i; renderDialog(); })));
    const opGrid = h('div', grid(3), ...PASTE_OPERATIONS.map((label, i) => option('radio', label, i === 0, false)));
    const checks = h('div', `display:grid;grid-template-columns:1fr 1fr;column-gap:12px;padding:10px 0;margin:0 0 14px;border-top:1px solid ${C.line};border-bottom:1px solid ${C.line}`,
      option('check', 'Skip &blanks', false, false),
      option('check', 'Transpos&e', dlgTranspose, true, () => { dlgTranspose = !dlgTranspose; renderDialog(); }));
    const okChip = h('span', 'font:600 11px/18px ui-monospace,Menlo,monospace;padding:0 5px;border-radius:5px;background:#1a1c1c;color:#d1ff00', '↵');
    const buttons = h('div', 'display:flex;gap:8px;align-items:center',
      button(false, false, null, 'Paste Link'),
      h('span', 'flex:1'),
      button(false, true, closeDialog, 'Cancel', chip('Esc', false)),
      button(true, true, applyDialog, 'OK', okChip));
    dlgCard.replaceChildren(
      h('div', `display:flex;align-items:baseline;gap:10px;margin:-18px -14px 16px;padding:12px 22px;border-radius:14px 14px 0 0;background:${C.accent}`,
        h('div', `font:600 15px/1.2 system-ui,sans-serif;color:${C.paper}`, 'Paste Special'),
        h('div', 'font-size:12px;color:#b8c5c9', 'Press a letter, then Enter')),
      group('Paste', pasteGrid), group('Operation', opGrid), checks, buttons);
  }
  function closeDialog() {
    if (dlg) dlg.remove();
    dlg = null;
    dlgCard = null;
  }
  function applyDialog() {
    const action = PASTE_RADIOS[dlgRadio][1];
    const transpose = dlgTranspose;
    closeDialog();
    if (!transpose) { run(action); return; }
    if (action !== 'pasteAll') toast('Sheets can only transpose a full paste. Pasted everything, transposed.', 4000);
    run('pasteTransposed');
  }
  function openPasteDialog() {
    closeDialog();
    hide();
    dlgRadio = 0;
    dlgTranspose = false;
    dlgCard = h('div', [
      'background:#fff', `color:${C.text}`, 'font:13px/1.4 system-ui,sans-serif', 'padding:18px 14px 14px',
      'border-radius:14px', 'box-shadow:0 24px 60px rgba(0,0,0,.28),0 0 0 1px rgba(0,0,0,.06)',
      'min-width:480px', 'user-select:none',
    ].join(';'));
    dlg = h('div', 'position:fixed;inset:0;z-index:2147483647;background:rgba(15,23,42,.18);display:flex;align-items:center;justify-content:center;padding-bottom:10vh', dlgCard);
    // Keep the focus (and the copied range) in the grid. A click next to the card closes it.
    dlg.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.target === dlg) closeDialog();
    });
    (document.body || document.documentElement).appendChild(dlg);
    renderDialog();
    dlgCard.animate(
      [{ opacity: 0, transform: 'translateY(8px) scale(.98)' }, { opacity: 1, transform: 'none' }],
      { duration: 140, easing: 'ease-out' });
  }
  function moveRadio(step) {
    const n = PASTE_RADIOS.length;
    let i = dlgRadio;
    do { i = (i + step + n) % n; } while (!PASTE_RADIOS[i][1]);
    dlgRadio = i;
  }
  function handleDialogKey(e) {
    consume(e);
    if (e.key === 'Escape') { closeDialog(); return; }
    if (e.key === 'Enter') { applyDialog(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { moveRadio(e.key === 'ArrowDown' ? 1 : -1); renderDialog(); return; }
    const tok = S.tokenFromEvent(e);
    if (tok === 'E') { dlgTranspose = !dlgTranspose; renderDialog(); return; }
    const i = PASTE_RADIOS.findIndex(([label, action]) => action && keyOf(label) === tok);
    if (i >= 0) { dlgRadio = i; renderDialog(); }
  }

  // ---------- actions ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function waitFor(fn, ms = 1500) {
    const end = Date.now() + ms;
    for (;;) {
      const v = fn();
      if (v) return v;
      if (Date.now() > end) return null;
      await sleep(40);
    }
  }
  const visible = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';

  function fire(el, types) {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    for (const t of types) {
      el.dispatchEvent(new MouseEvent(t, {
        bubbles: t !== 'mouseenter', cancelable: true, composed: true, view: window,
        clientX: x, clientY: y, screenX: x, screenY: y, button: 0, buttons: t === 'mousedown' ? 1 : 0, detail: 1,
      }));
    }
  }

  function sendKeys(k) {
    const target = document.activeElement && document.activeElement !== document.documentElement
      ? document.activeElement : document.body;
    for (const type of ['keydown', 'keyup']) {
      target.dispatchEvent(new KeyboardEvent(type, {
        key: k.key, code: k.code, keyCode: k.keyCode, which: k.keyCode,
        ctrlKey: !!k.ctrl, altKey: !!k.alt, shiftKey: !!k.shift, metaKey: !!k.meta,
        bubbles: true, cancelable: true, composed: true, view: window,
      }));
    }
  }

  const matcher = (seg) => {
    const m = /^\/(.*)\/$/.exec(seg);
    if (m) { const re = new RegExp(m[1], 'i'); return (s) => re.test(s); }
    const want = seg.toLowerCase();
    return (s) => s.toLowerCase().startsWith(want);
  };

  function itemLabel(item) {
    const c = (item.querySelector('.goog-menuitem-content') || item).cloneNode(true);
    c.querySelectorAll('.goog-menuitem-accel, .goog-submenu-arrow, .goog-menuitem-mnemonic-separator').forEach((n) => n.remove());
    return c.textContent.replace(/\s+/g, ' ').trim();
  }
  let baseline = new Set(); // menus that were already visible before we opened anything
  const openMenus = () => [...document.querySelectorAll('.goog-menu')].filter((m) => visible(m) && !baseline.has(m));

  function topButton(name) {
    const byId = document.getElementById(`docs-${name.toLowerCase()}-menu`);
    if (byId) return byId;
    const is = matcher(name);
    return [...document.querySelectorAll('.menu-button, [role="menubar"] [role="menuitem"]')]
      .find((el) => is(el.textContent.trim())) || null;
  }

  function findItem(is, usedMenus) {
    for (const menu of openMenus().reverse()) {
      if (usedMenus.has(menu)) continue;
      for (const item of menu.querySelectorAll('.goog-menuitem')) {
        if (!visible(item) || item.classList.contains('goog-menuitem-disabled')) continue;
        if (is(itemLabel(item))) return item;
      }
    }
    return null;
  }

  function closeMenus() {
    for (let i = 0; i < 4 && openMenus().length; i++) {
      sendKeys({ key: 'Escape', code: 'Escape', keyCode: 27 });
    }
  }

  async function runMenu(path) {
    const segs = path.split('>').map((s) => s.trim()).filter(Boolean);
    const top = topButton(segs[0]);
    if (!top) { toast(`Menu not found: ${segs[0]}`); return false; }
    baseline = new Set();
    baseline = new Set(openMenus());
    fire(top, ['mousedown', 'mouseup']);
    if (!(await waitFor(() => openMenus().length > 0, 300))) fire(top, ['click']);

    const used = new Set();
    for (let i = 1; i < segs.length; i++) {
      const is = matcher(segs[i]);
      let item = await waitFor(() => findItem(is, used), 700);
      if (!item && i > 1) item = await waitFor(() => findItem(is, used), 800);
      if (!item) {
        closeMenus();
        toast(`Menu item not found: ${segs.slice(0, i + 1).join(' > ')}`);
        return false;
      }
      const isSub = item.classList.contains('goog-submenu') || item.getAttribute('aria-haspopup') === 'true';
      if (i === segs.length - 1 && !isSub) {
        fire(item, ['mouseenter', 'mouseover', 'mousemove', 'mousedown', 'mouseup', 'click']);
        return true;
      }
      used.add(item.closest('.goog-menu'));
      fire(item, ['mouseenter', 'mouseover', 'mousemove']);
      // Submenus open after a hover delay. If nothing shows up, click the entry as a fallback.
      const before = openMenus().length;
      if (!(await waitFor(() => openMenus().length > before, 600))) fire(item, ['mousedown', 'mouseup']);
    }
    return true; // path ended on a submenu: leave it open
  }

  const ZOOMS = [50, 75, 90, 100, 125, 150, 200];
  function currentZoom() {
    for (const el of document.querySelectorAll('#t-zoom, #zoomSelect, [aria-label^="Zoom"]')) {
      const m = /(\d+)\s*%/.exec(`${el.textContent} ${el.querySelector?.('input')?.value || ''} ${el.value || ''}`);
      if (m) return Number(m[1]);
    }
    return 100;
  }
  async function zoom(dir) {
    const cur = currentZoom();
    const next = dir === 'in' ? ZOOMS.find((z) => z > cur) : [...ZOOMS].reverse().find((z) => z < cur);
    if (!next) { toast(`Zoom already at ${cur}%`); return; }
    await runMenu(`View > Zoom > ${next}%`);
  }

  let busy = false;
  async function run(actionId) {
    if (busy) return;
    busy = true;
    try {
      if (actionId.startsWith('menu:')) { await runMenu(actionId.slice(5)); return; }
      const spec = S.ACTIONS[actionId];
      if (!spec) { toast(`Unknown action: ${actionId}`); return; }
      if (spec.dialog) openPasteDialog();
      else if (spec.paste) { if (!document.execCommand('paste')) await runMenu('Edit > /^Paste$/'); }
      else if (spec.keys) sendKeys(spec.keys);
      else if (spec.zoom) await zoom(spec.zoom);
      else if (spec.menu) {
        for (const path of spec.menu) {
          if (!(await runMenu(path))) break;
          await sleep(120);
        }
      }
    } catch (err) {
      console.error('[ARC Sheets Mouse Remover]', err);
      toast(`Shortcut failed: ${err.message}`);
    } finally {
      busy = false;
    }
  }
})();
