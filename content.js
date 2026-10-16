// Fathom Auto-Admit: watches the Google Meet waiting room and admits the
// configured notetaker bot(s). Everything is text/ARIA based because Meet's
// class names are obfuscated and change often.

const DEFAULTS = {
  enabled: true,
  names: ["Ryan's Fathom Notetaker"],
  autoOpenPanel: true,
  admittedCount: 0,
};
const LOG = (...a) => console.debug('[Fathom Auto-Admit]', ...a);
const BTN = 'button, [role="button"], [role="menuitem"]';
const ROW_TEXT_MAX = 200; // a single waiting row / toast is short; whole panels are not

let settings = { ...DEFAULTS };
let busy = false;
let lastWaitingCount = 0;
let lastIndicatorSeen = 0;
const attempted = new WeakMap(); // row node -> timestamp of last attempt

const norm = (s) =>
  (s || '').replace(/[\u2018\u2019\u02BC`]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
const targets = () => settings.names.map(norm).filter(Boolean);
const matchesTarget = (text) => {
  const t = norm(text);
  return !!t && targets().some((n) => t.includes(n));
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isVisible(el) {
  if (!el || !el.isConnected) return false;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;
  const cs = getComputedStyle(el);
  return cs.visibility !== 'hidden' && cs.display !== 'none';
}

const label = (el) => norm(el.getAttribute('aria-label') || el.textContent);
const buttonsIn = (root) => [...root.querySelectorAll(BTN)].filter(isVisible);
const isAdmit = (b) => /^admit\b/.test(label(b)) && !/^admit all/.test(label(b));
const isDeny = (b) => /^deny\b/.test(label(b)) && !/^deny all/.test(label(b));
const isMore = (b) => /more (options|actions)|more_vert/.test(label(b));

function realClick(el) {
  const r = el.getBoundingClientRect();
  const opts = { bubbles: true, cancelable: true, view: window, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
  el.dispatchEvent(new PointerEvent('pointerdown', opts));
  el.dispatchEvent(new MouseEvent('mousedown', opts));
  el.dispatchEvent(new PointerEvent('pointerup', opts));
  el.dispatchEvent(new MouseEvent('mouseup', opts));
  el.click();
}

async function waitFor(fn, timeout = 2000, step = 100) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await sleep(step);
  }
  return null;
}

// Elements (text or aria-label) that mention one of the target names.
function findNameElements() {
  const out = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    if (matchesTarget(walker.currentNode.nodeValue)) out.add(walker.currentNode.parentElement);
  }
  for (const el of document.querySelectorAll('[aria-label]')) {
    if (!el.matches(BTN) && matchesTarget(el.getAttribute('aria-label'))) out.add(el);
  }
  return [...out].filter(isVisible);
}

// Climb from the name to the smallest container holding exactly one waiting
// row's controls. Bail out if that container is clearly more than one row,
// so we never admit someone else.
function rowFor(el) {
  let node = el;
  for (let i = 0; i < 8 && node && node !== document.body; i++, node = node.parentElement) {
    const btns = buttonsIn(node);
    const admits = btns.filter(isAdmit);
    const denies = btns.filter(isDeny);
    if (!admits.length && !denies.length) continue;
    if (admits.length > 1 || denies.length > 1) return null;
    if (norm(node.textContent).length > ROW_TEXT_MAX) return null;
    const items = node.querySelectorAll('[role="listitem"]');
    if ([...items].some((li) => !li.contains(el))) return null;
    return { node, admit: admits[0], more: btns.find(isMore) };
  }
  return null;
}

// Some risky-guest admits pop a confirmation dialog.
async function confirmIfAsked() {
  const btn = await waitFor(() => {
    for (const d of document.querySelectorAll('[role="dialog"], [role="alertdialog"]')) {
      if (!isVisible(d) || !matchesTarget(d.textContent)) continue;
      if (norm(d.textContent).length > 400) continue;
      const admits = buttonsIn(d).filter((b) => /^admit\b/.test(label(b)));
      if (admits.length === 1) return admits[0];
    }
    return null;
  }, 1500);
  if (btn) {
    LOG('confirming admit dialog');
    realClick(btn);
  }
}

async function admitRow(row) {
  if (row.admit) {
    LOG('clicking Admit');
    realClick(row.admit);
  } else if (row.more) {
    // "With potential risks" rows only show Deny; Admit lives in the ... menu.
    LOG('opening row menu');
    realClick(row.more);
    const item = await waitFor(() =>
      [...document.querySelectorAll('[role="menu"] [role="menuitem"], [role="menu"] li, [role="menuitem"]')]
        .filter(isVisible)
        .find(isAdmit)
    );
    if (!item) {
      LOG('no Admit item in menu');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return false;
    }
    realClick(item);
  } else {
    return false;
  }
  await confirmIfAsked();
  return true;
}

// Expand a collapsed "Waiting to join" / "With potential risks" group inside
// the People panel. Must not match the "N guests waiting" chip, which toggles
// the whole panel.
function expandWaitingGroups() {
  for (const b of document.querySelectorAll('[aria-expanded="false"]')) {
    if (isVisible(b) && /^(with )?potential risk|^waiting to join/.test(label(b))) realClick(b);
  }
}

// The waiting list is already on screen (People panel open).
const waitingListOpen = () =>
  [...document.querySelectorAll('h1, h2, h3, h4, [role="heading"], div, span')].some(
    (el) => el.childElementCount === 0 && /^waiting to join$/.test(norm(el.textContent)) && isVisible(el)
  );

// The bot's name shows somewhere that isn't a waiting row or join request,
// e.g. its video tile or the "In the meeting" list.
function botInMeeting(nameEls) {
  return nameEls.some((el) => {
    let node = el;
    for (let i = 0; i < 4 && node && node !== document.body; i++, node = node.parentElement) {
      const t = norm(node.textContent);
      if (t.length > ROW_TEXT_MAX) break;
      if (/wants? to join|asking to join|waiting|\badmit\b|\bdeny\b/.test(t)) return false;
    }
    return true;
  });
}

// Open the waiting list only when the number of waiting guests goes up, and
// never click the chip while the panel is already open (it would close it).
function openWaitingListIfNeeded(nameEls) {
  if (!settings.autoOpenPanel || waitingListOpen() || botInMeeting(nameEls)) return;
  const indicator = [...document.querySelectorAll(BTN)]
    .filter(isVisible)
    .find((b) => /\b(guests?|people|person|someone)\b.*\b(waiting|wants? to join)\b|^view all\b/.test(label(b)));
  if (!indicator) {
    if (Date.now() - lastIndicatorSeen > 10000) lastWaitingCount = 0;
    return;
  }
  lastIndicatorSeen = Date.now();
  const count = parseInt((label(indicator).match(/\d+/) || ['1'])[0], 10);
  if (count <= lastWaitingCount) {
    lastWaitingCount = count; // someone left or was denied; a later arrival counts as new
    return;
  }
  lastWaitingCount = count;
  LOG('opening waiting list via', label(indicator));
  realClick(indicator);
}

async function scan() {
  if (busy || !settings.enabled || !targets().length) return;
  busy = true;
  try {
    expandWaitingGroups();
    // Button whose own label names the bot, e.g. aria-label="Admit Ryan's Fathom Notetaker".
    const direct = [...document.querySelectorAll(BTN)].filter(isVisible).find((b) => isAdmit(b) && matchesTarget(b.getAttribute('aria-label')));
    const nameEls = direct ? [] : findNameElements();
    const rows = direct ? [{ node: direct, admit: direct }] : nameEls.map(rowFor).filter(Boolean);

    if (!rows.length) {
      openWaitingListIfNeeded(nameEls);
      return;
    }
    for (const row of rows) {
      const last = attempted.get(row.node) || 0;
      if (Date.now() - last < 4000) continue;
      attempted.set(row.node, Date.now());
      if (await admitRow(row)) {
        settings.admittedCount += 1;
        chrome.storage.sync.set({ admittedCount: settings.admittedCount });
        showToast('Fathom Notetaker admitted');
        await sleep(1500);
      }
    }
  } catch (e) {
    LOG('error', e);
  } finally {
    busy = false;
  }
}

function showToast(text) {
  const t = document.createElement('div');
  t.textContent = '\u2713 ' + text;
  Object.assign(t.style, {
    position: 'fixed', bottom: '96px', left: '50%', transform: 'translateX(-50%)', zIndex: 2147483647,
    background: '#1e8e3e', color: '#fff', padding: '8px 16px', borderRadius: '8px',
    font: '500 14px/1.4 system-ui, sans-serif', boxShadow: '0 2px 8px rgba(0,0,0,.3)', pointerEvents: 'none',
  });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

let debounce;
const schedule = () => {
  clearTimeout(debounce);
  debounce = setTimeout(scan, 300);
};

chrome.storage.sync.get(DEFAULTS, (s) => {
  settings = { ...DEFAULTS, ...s };
  LOG('ready, watching for', settings.names);
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, characterData: true });
  setInterval(scan, 2000);
  scan();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  for (const [k, { newValue }] of Object.entries(changes)) settings[k] = newValue;
  schedule();
});
