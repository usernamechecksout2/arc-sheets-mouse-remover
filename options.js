(() => {
  const S = globalThis.SEK;
  const $ = (id) => document.getElementById(id);
  const rowsEl = $('rows');
  let cfg = null;
  let recording = null; // { index, tokens }
  let saveTimer = null;

  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      await S.saveConfig(cfg);
      $('status').textContent = 'Saved';
      setTimeout(() => { $('status').textContent = ''; }, 1500);
    }, 150);
  }

  function showKeys(b) {
    if (!b.keys) return 'click to set';
    if (b.type === 'chord') return S.isMac ? b.keys.replace(/\bAlt\b/, '⌥').replace(/\bCmd\b/, '⌘') : b.keys;
    return `${S.triggerLabel(cfg.trigger)} ${b.keys}`;
  }

  function warnings(b, i) {
    if (!b.keys || b.enabled === false) return '';
    const others = cfg.bindings.filter((o, j) => j !== i && o.enabled !== false && o.type === b.type && o.keys);
    if (others.some((o) => o.keys === b.keys)) return 'Already used by another shortcut.';
    if (b.type === 'seq') {
      const clash = others.find((o) => o.keys.startsWith(b.keys + ' ') || b.keys.startsWith(o.keys + ' '));
      if (clash) return `Overlaps with "${clash.keys}". The shorter one always wins.`;
    }
    return '';
  }

  function el(tag, props = {}, ...children) {
    const n = Object.assign(document.createElement(tag), props);
    n.append(...children);
    return n;
  }

  function render() {
    $('trigger').value = `${cfg.trigger.key}:${cfg.trigger.taps}`;
    $('timeout').value = cfg.timeoutMs / 1000;
    $('swap').checked = !!cfg.swapCmdCtrl;
    rowsEl.replaceChildren(...cfg.bindings.map((b, i) => {
      const isRec = recording && recording.index === i;
      const on = el('input', { type: 'checkbox', checked: b.enabled !== false });
      on.addEventListener('change', () => { b.enabled = on.checked; save(); render(); });

      const keys = el('button', {
        className: 'keys' + (isRec ? ' rec' : ''),
        textContent: isRec ? (recording.tokens.join(' ') || 'press keys…') : showKeys(b),
      });
      keys.addEventListener('click', () => { recording = isRec ? null : { index: i, tokens: [] }; render(); });

      const isCustom = b.action.startsWith('menu:');
      const sel = el('select', {},
        ...Object.entries(S.ACTIONS).map(([id, a]) => el('option', { value: id, textContent: a.label })),
        el('option', { value: 'custom', textContent: 'Custom menu path…' }));
      sel.value = isCustom ? 'custom' : b.action;
      sel.addEventListener('change', () => { b.action = sel.value === 'custom' ? 'menu:' : sel.value; save(); render(); });
      const actCell = el('td', { className: 'act' }, sel);
      if (isCustom) {
        const path = el('input', { type: 'text', className: 'custom', placeholder: 'Data > Create a filter', value: b.action.slice(5) });
        path.addEventListener('input', () => { b.action = 'menu:' + path.value.trim(); save(); });
        actCell.append(path);
      }

      const keyCell = el('td', {}, keys);
      const w = warnings(b, i);
      if (w) keyCell.append(el('div', { className: 'warn', textContent: w }));

      const del = el('button', { className: 'del', title: 'Remove', textContent: '✕' });
      del.addEventListener('click', () => { cfg.bindings.splice(i, 1); recording = null; save(); render(); });

      return el('tr', { className: b.enabled === false ? 'off' : '' }, el('td', {}, on), keyCell, actCell, el('td', {}, del));
    }));
  }

  function finishRecording(type, keys) {
    const b = cfg.bindings[recording.index];
    b.type = type;
    b.keys = keys;
    recording = null;
    save();
    render();
  }

  window.addEventListener('keydown', (e) => {
    if (!recording) return;
    if (['Alt', 'Control', 'Shift', 'Meta', 'CapsLock'].includes(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') { recording = null; render(); return; }
    if (e.key === 'Backspace' && !e.ctrlKey && !e.metaKey && !e.altKey) { recording.tokens.pop(); render(); return; }
    if (e.key === 'Enter') {
      if (recording.tokens.length) finishRecording('seq', recording.tokens.join(' '));
      return;
    }
    if (!recording.tokens.length && S.isChordPress(e)) { finishRecording('chord', S.chordFromEvent(e)); return; }
    const tok = S.tokenFromEvent(e);
    if (tok && tok.length === 1) { recording.tokens.push(tok); render(); }
  }, true);

  $('trigger').addEventListener('change', (e) => {
    const [key, taps] = e.target.value.split(':');
    cfg.trigger = { key, taps: Number(taps) };
    save();
    render();
  });
  $('timeout').addEventListener('change', (e) => {
    const s = Number(e.target.value);
    if (s > 0) { cfg.timeoutMs = Math.round(s * 1000); save(); }
  });
  $('swap').addEventListener('change', (e) => { cfg.swapCmdCtrl = e.target.checked; save(); });
  $('add').addEventListener('click', () => {
    cfg.bindings.push({ type: 'seq', keys: '', action: 'insertRowAbove', enabled: true });
    recording = { index: cfg.bindings.length - 1, tokens: [] };
    render();
    rowsEl.lastElementChild.scrollIntoView({ block: 'center' });
  });
  $('reset').addEventListener('click', () => {
    if (!confirm('Replace all shortcuts with the defaults?')) return;
    cfg = structuredClone(S.DEFAULT_CONFIG);
    recording = null;
    save();
    render();
  });

  S.loadConfig().then((c) => { cfg = c; render(); });
})();
