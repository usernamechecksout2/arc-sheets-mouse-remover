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

  const SYM = { Alt: '⌥', Cmd: '⌘', Ctrl: '⌃', Shift: '⇧' };
  const kbd = (t) => el('kbd', { textContent: t });
  function keyNodes(b) {
    if (!b.keys) return [el('span', { className: 'hint', textContent: 'Click to set' })];
    if (b.type === 'chord') {
      return b.keys.replace(/\+\+$/, '+PLUS').split('+')
        .map((t) => kbd(t === 'PLUS' ? '+' : (S.isMac && SYM[t]) || t));
    }
    return [...S.triggerLabel(cfg.trigger).split(' '), ...b.keys.split(' ')].map(kbd);
  }
  function keyText(b) {
    return b.type === 'chord' ? b.keys : `${S.triggerLabel(cfg.trigger)} ${b.keys}`;
  }

  const GROUPS = ['Rows and columns', 'Navigation', 'View', 'Paste', 'Custom'];
  function groupOf(b) {
    const a = b.action;
    if (a.startsWith('menu:')) return 'Custom';
    if (/^paste/.test(a)) return 'Paste';
    if (/^(zoom|freeze|unfreeze)/.test(a)) return 'View';
    if (/^(prev|next|go)/.test(a)) return 'Navigation';
    return 'Rows and columns';
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
    const q = $('search').value.trim().toLowerCase();
    const byGroup = new Map(GROUPS.map((g) => [g, []]));
    cfg.bindings.forEach((b, i) => {
      const isRec = recording && recording.index === i;
      if (q && !isRec && !`${S.actionLabel(b.action)} ${keyText(b)}`.toLowerCase().includes(q)) return;
      byGroup.get(groupOf(b)).push(row(b, i));
    });
    const out = [];
    for (const [g, rows] of byGroup) {
      if (!rows.length) continue;
      out.push(el('tr', { className: 'grp' }, el('td', { colSpan: 4, className: 'label', textContent: g })), ...rows);
    }
    if (!out.length) out.push(el('tr', {}, el('td', { className: 'empty', textContent: q ? 'No shortcut matches. Try another word.' : 'Add your first shortcut.' })));
    rowsEl.replaceChildren(...out);
  }

  function row(b, i) {
    {
      const isRec = recording && recording.index === i;
      const on = el('input', { type: 'checkbox', className: 'tg', checked: b.enabled !== false, ariaLabel: 'Enabled' });
      on.addEventListener('change', () => { b.enabled = on.checked; save(); render(); });

      const keys = el('button', { className: 'keys' + (isRec ? ' rec' : '') },
        ...(isRec
          ? (recording.tokens.length ? recording.tokens.map(kbd) : [el('span', { className: 'hint', textContent: 'Press keys…' })])
          : keyNodes(b)));
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

      const keyCell = el('td', { className: 'k' }, keys);
      const w = warnings(b, i);
      if (w) keyCell.append(el('div', { className: 'warn', textContent: w }));

      const del = el('button', { className: 'del', title: 'Remove', textContent: '✕' });
      del.addEventListener('click', () => { cfg.bindings.splice(i, 1); recording = null; save(); render(); });

      return el('tr', { className: 'b' + (b.enabled === false ? ' off' : '') }, el('td', {}, on), keyCell, actCell, el('td', {}, del));
    }
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
    rowsEl.querySelector('.rec')?.scrollIntoView({ block: 'center' });
  });
  $('reset').addEventListener('click', () => {
    if (!confirm('Replace all shortcuts with the defaults?')) return;
    cfg = structuredClone(S.DEFAULT_CONFIG);
    recording = null;
    save();
    render();
  });

  $('search').addEventListener('input', render);
  const ver = globalThis.chrome?.runtime?.getManifest?.().version;
  if (ver) $('version').textContent = `ASMR ${ver}`;

  S.loadConfig().then((c) => { cfg = c; render(); });
})();
