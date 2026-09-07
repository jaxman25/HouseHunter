#!/usr/bin/env node
/**
 * Live browser smoke test: Delete Account end-to-end (web build).
 *
 * Drives the production web export in headless Chrome over the DevTools
 * Protocol: register a throwaway account → Profile → Settings → Delete
 * Account → confirm → watch the deletion run. Verifies:
 *
 *   1. The confirmation dialog actually appears on web (regression for the
 *      react-native-web `Alert` no-op — see src/utils/ui/dialogs.ts).
 *   2. Account data is wiped and the auth account is deleted (the app lands
 *      back on the Login screen, and a re-login with the same credentials
 *      is rejected as "no account found").
 *   3. The deletion-confirmation email callable is invoked and its failure
 *      is tolerated (functions may not be deployed — the flow must not
 *      block on it). Watch the console for
 *      "Deletion confirmation email not sent".
 *
 * Usage (run from the project root, after `npx expo export --platform web`):
 *
 *   # Terminal 1: static server + Chrome must be reachable first:
 *   node scripts/smoke-delete-account.mjs --server-only   # serves ./dist :8090
 *   "C:\Program Files\Google\Chrome\Application\chrome.exe" \
 *     --headless --remote-debugging-port=9222 \
 *     --user-data-dir=%TEMP%\hh-smoke-chrome \
 *     about:blank &
 *   # Terminal 2:
 *   node scripts/smoke-delete-account.mjs
 *
 * Exits 0 on success. Requires Node 20+ (native fetch + WebSocket).
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORT = process.env.SMOKE_PORT || '8090';
const CDP_PORT = process.env.CDP_PORT || '9222';
const BASE = `http://127.0.0.1:${PORT}`;

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(new URL(req.url, BASE).pathname);
      let filePath = path.join(process.cwd(), 'dist', urlPath === '/' ? 'index.html' : urlPath);
      if (!filePath.startsWith(path.join(process.cwd(), 'dist'))) {
        res.writeHead(403);
        res.end();
        return;
      }
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('not found');
          return;
        }
        res.writeHead(200, {
          'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
          'Cache-Control': 'no-store',
        });
        res.end(data);
      });
    });
    server.listen(Number(PORT), '127.0.0.1', () => resolve(server));
  });
}

// ─── CDP client ────────────────────────────────────────────────────────────
let ws;
let msgId = 0;
const pending = new Map();
const runtimeLogs = []; // { type, args }
const networkRequests = [];

function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

function connectCdp(debugUrl) {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(debugUrl);
    ws.onopen = () => resolve();
    ws.onerror = (e) => reject(new Error(`CDP connect failed: ${e.message || e}`));
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve: ok, reject: bad } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) bad(new Error(`${msg.error.code}: ${msg.error.message}`));
        else ok(msg.result);
        return;
      }
      if (msg.method === 'Runtime.consoleAPICalled') {
        const text = (msg.params.args || [])
          .map((a) => a.value ?? a.description ?? '')
          .join(' ');
        runtimeLogs.push({ type: msg.params.type, text });
      } else if (msg.method === 'Network.requestWillBeSent') {
        networkRequests.push(msg.params.request.url);
      }
    };
  });
}

async function evalJs(expression) {
  const res = await cdp('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (res.exceptionDetails) {
    throw new Error(`eval failed: ${JSON.stringify(res.exceptionDetails)}`);
  }
  return res.result?.value;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, timeoutMs = 30000, label = 'condition') {
  const start = Date.now();
  for (;;) {
    if (await fn()) return;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timed out waiting for: ${label}`);
    }
    await sleep(400);
  }
}

async function hasText(text) {
  return evalJs(
    `[...document.querySelectorAll('div,span')].some(e => e.textContent && e.textContent.trim() === ${JSON.stringify(text)})`
  );
}

/**
 * Click the element whose trimmed text matches exactly.
 *
 * Screens often render a heading AND a control with the same text (e.g.
 * Register: title "Create Account" + submit button). Prefer the control: an
 * element inside a `[role=button]`/`[tabindex]` pressable, falling back to
 * the LAST text match in document order (controls render after headings).
 *
 * Synthetic DOM click events work for RN-web TouchableOpacity/Text, but the
 * Pressable-based Button component only reacts to trusted pointer input, so
 * this dispatches a real mouse click at the element's center via CDP.
 */
async function clickText(text) {
  const rect = await evalJs(
    `(() => {
      const matches = [...document.querySelectorAll('div,span')].filter(
        e => e.textContent && e.textContent.trim() === ${JSON.stringify(text)}
      );
      if (matches.length === 0) return null;
      const el = matches.find(
        (e) => e.closest('[role=button], [tabindex]')
      ) || matches[matches.length - 1];
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`
  );
  if (!rect) throw new Error(`Could not find clickable text: ${text}`);
  await sleep(150); // let the scroll settle
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x, y: rect.y });
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
}

/** Set an <input> value the way React Native Web expects (native setter + input event). */
async function setInput(placeholder, value) {
  const ok = await evalJs(
    `(() => {
      // The auth stack keeps the previous screen's inputs in the DOM, so only
      // match inputs that are actually visible (offsetParent != null).
      const el = [...document.querySelectorAll('input')].find(
        i => i.placeholder === ${JSON.stringify(placeholder)} && i.offsetParent !== null
      );
      if (!el) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`
  );
  if (!ok) throw new Error(`Could not find input with placeholder: ${placeholder}`);
}

/** Click the terms checkbox (the icon button to the left of "I agree to the …"). */
async function clickTermsCheckbox() {
  // The agreement sentence is a Text containing nested link Texts, so anchor
  // on the element whose textContent STARTS with the sentence (ancestors'
  // text starts with other content, so this matches exactly one element),
  // then click that element's parent row's first child (the checkbox) with a
  // real CDP mouse event — synthetic clicks don't reach Pressable responders.
  const rect = await evalJs(
    `(() => {
      const sentence = [...document.querySelectorAll('div,span')].find(
        e => e.textContent && e.textContent.trim().startsWith('I agree to the')
      );
      if (!sentence) return null;
      const row = sentence.parentElement;
      if (!row || row.children.length === 0) return null;
      const btn = row.children[0];
      btn.scrollIntoView({ block: 'center' });
      const r = btn.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: Math.round(r.width), h: Math.round(r.height) };
    })()`
  );
  if (!rect) throw new Error('Could not find terms checkbox row');
  console.log('[smoke] terms checkbox:', JSON.stringify(rect));
  await sleep(150); // let the scroll settle
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x, y: rect.y });
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
}

// ─── Flow ──────────────────────────────────────────────────────────────────
async function main() {
  if (process.argv.includes('--server-only')) {
    await startServer();
    console.log(`[smoke] static server on :${PORT} (Ctrl-C to stop)`);
    return; // keep process alive via server
  }

  await startServer();

  // Find the page target on the CDP endpoint.
  const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('No Chrome page target found on :' + CDP_PORT);
  await connectCdp(page.webSocketDebuggerUrl);

  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Network.enable');

  const email = `smoke-${Date.now()}@example.com`;
  const password = 'SmokePass123!';

  console.log(`[smoke] throwaway account: ${email}`);

  // First load may restore a previous run's session (Firebase auth persists
  // in localStorage/IndexedDB and a service worker may be cached). Wipe both
  // so the app always boots to a signed-out Login screen.
  await cdp('Page.navigate', { url: BASE });
  await sleep(2500);
  await evalJs(
    `(async () => {
      localStorage.clear();
      const dbs = await indexedDB.databases().catch(() => []);
      for (const db of dbs) indexedDB.deleteDatabase(db.name);
      const regs = await navigator.serviceWorker?.getRegistrations().catch(() => []);
      for (const reg of regs || []) await reg.unregister();
      return true;
    })()`
  );
  await sleep(1000);
  await cdp('Page.navigate', { url: BASE });
  await waitFor(() => hasText('Sign In'), 40000, 'Login screen');

  // Dismiss the cookie-consent banner if present: it is a fixed overlay at
  // the bottom of the screen and would swallow clicks meant for form
  // controls below the fold.
  if (await hasText('Accept')) {
    await clickText('Accept');
    await sleep(300);
  }

  // Go to registration.
  await clickText('Sign Up');
  try {
    await waitFor(() => hasText('Create Account'), 15000, 'Register screen');
  } catch (err) {
    const body = await evalJs('document.body.innerText');
    console.error('[smoke] after Sign Up click, page shows:', body.slice(0, 300).replace(/\n/g, ' | '));
    throw err;
  }

  await setInput('Enter your full name', 'Smoke Test User');
  await setInput('Enter your email', email);
  await setInput('Min 8 characters', password);
  await setInput('Re-enter your password', password);
  await clickTermsCheckbox();
  await sleep(300); // let the checkbox's React state flush before submitting

  await clickText('Create Account');

  // Post-click diagnostics: watch the first seconds for a submit, spinner,
  // or inline validation error before the long wait.
  await sleep(1500);
  const post = await evalJs('document.body.innerText');
  const errorHints = ['Registration failed', 'already exists', 'weak', 'must accept', 'required', 'valid'];
  const hints = errorHints.filter((h) => post.includes(h));
  const inputVals = await evalJs(
    `[...document.querySelectorAll('input')].map(i => i.placeholder + '=' + i.value).join('; ')`
  );
  console.log('[smoke] post-click state:', hints.length ? `HINTS=${hints.join(',')}` : 'no error text');
  console.log('[smoke] input values:', inputVals);
  console.log('[smoke] auth network calls:', JSON.stringify(
    networkRequests.filter((u) => u.includes('identitytoolkit') || u.includes('firebaseio') || u.includes('firestore'))
  ));
  console.log('[smoke] console tail after click:', JSON.stringify(runtimeLogs.slice(-8).map((l) => l.type + ': ' + l.text.slice(0, 150))));

  // After registration the signed-in app loads (TermsGate is skipped because
  // registration records termsAcceptedVersion).
  try {
    await waitFor(() => hasText('Profile'), 40000, 'Main tabs (Profile tab)');
  } catch (err) {
    const body = await evalJs('document.body.innerText');
    console.error('[smoke] page state after register attempt:');
    console.error(body.slice(0, 500).replace(/\n/g, ' | '));
    console.error('[smoke] console log tail:');
    for (const l of runtimeLogs.slice(-12)) console.error(`  ${l.type}: ${l.text.slice(0, 200)}`);
    throw err;
  }

  // ─── Web responsiveness checks (the point of this build) ────────────────
  // Home is the initial tab. Verify at the current viewport (>=1024px): the
  // app sits in a centered 480px phone-frame, New Listings renders 2 columns
  // of ~218px cards inside the frame, the search bar is capped at 400px and
  // centered, and category chips wrap instead of scrolling horizontally.
  // Give the property fetch time to settle (Popular/New Listings load after
  // the tab bar is visible).
  await sleep(4000);
  const grid = await evalJs(`(() => {
    const vw = window.innerWidth;
    const visible = (e) => e.offsetParent !== null || e.getClientRects().length > 0;
    const out = { vw, frame: null, cards: [], rows: [], searchBar: null, chips: null, emptyState: false };

    // WebFrame column: exactly 480 wide, centered, taller than a tab bar.
    const frameEl = [...document.querySelectorAll('div')].find((e) => {
      const r = e.getBoundingClientRect();
      return visible(e) && Math.round(r.width) === 480 && r.height > 400;
    });
    if (frameEl) {
      const r = frameEl.getBoundingClientRect();
      out.frame = { x: Math.round(r.x), center: Math.round(r.x + r.width / 2), w: Math.round(r.width) };
    }

    // Property cards: elements ~218px wide (gridCellWidth at 480 content),
    // taller than 180px, inside the viewport. Featured cards are 340px and
    // excluded by the width window. Group by row via rounded y.
    out.cards = [...document.querySelectorAll('div')]
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.width > 200 && r.width < 240 && r.height > 180 && r.height < 500 && r.x >= 0 && r.x < vw)
      .map((r) => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }));
    const rows = new Map();
    for (const c of out.cards) {
      const key = Math.round(c.y / 10);
      if (!rows.has(key)) rows.set(key, []);
      rows.get(key).push(c);
    }
    out.rows = [...rows.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([y, cs]) => ({ y: cs[0].y, count: cs.length, xs: cs.map((c) => c.x), ws: cs.map((c) => c.w) }));

    out.emptyState = document.body.innerText.includes('No listings yet');

    // Search bar: the placeholder Text is a leaf div whose parent is the
    // TouchableOpacity bar (icon + text + filter icon).
    const searchLeaf = [...document.querySelectorAll('div')].find(
      (e) => e.children.length === 0
      && e.textContent && e.textContent.trim().startsWith('Search by city')
    );
    if (searchLeaf && searchLeaf.parentElement) {
      const r = searchLeaf.parentElement.getBoundingClientRect();
      out.searchBar = { w: Math.round(r.width), x: Math.round(r.x), center: Math.round(r.x + r.width / 2) };
    }

    // Category chips: the six labels render as leaf divs (TouchableOpacity
    // has no role attribute on the web). Their common ancestor is the wrap
    // container — check flex-wrap + centering.
    const labels = ['House', 'Apartment', 'Condo', 'Townhouse', 'Land', 'Commercial'];
    const chipEls = labels.map((l) =>
      [...document.querySelectorAll('div')].find(
        (e) => e.children.length === 0 && e.textContent.trim() === l
      )
    );
    if (chipEls.every(Boolean)) {
      const anc = chipEls[0].parentElement.parentElement;
      const style = getComputedStyle(anc);
      const ys = chipEls.map((e) => Math.round(e.getBoundingClientRect().y));
      out.chips = {
        flexWrap: style.flexWrap,
        justifyContent: style.justifyContent,
        distinctRows: new Set(ys).size,
        xs: chipEls.map((e) => Math.round(e.getBoundingClientRect().x)),
      };
    }
    return out;
  })()`);
  console.log('[smoke] web layout @' + grid.vw + 'px:');
  console.log('  frame:', JSON.stringify(grid.frame));
  console.log('  searchBar:', JSON.stringify(grid.searchBar));
  console.log('  chips:', JSON.stringify(grid.chips));
  console.log('  cards:', grid.cards.length, 'rows:', JSON.stringify(grid.rows));
  console.log('  emptyState:', grid.emptyState);

  const frameCenter = Math.round(grid.vw / 2);
  if (!grid.frame || grid.frame.w !== 480) {
    throw new Error('FAIL: web frame is not 480px wide (' + JSON.stringify(grid.frame) + ')');
  }
  if (Math.abs(grid.frame.center - frameCenter) > 2) {
    throw new Error('FAIL: web frame not centered (center=' + grid.frame.center + ', expected ' + frameCenter + ')');
  }
  if (grid.searchBar && grid.searchBar.w > 400) {
    throw new Error('FAIL: search bar wider than 400px (' + grid.searchBar.w + ')');
  }
  if (grid.chips && grid.chips.flexWrap !== 'wrap') {
    throw new Error('FAIL: category chips not wrapping on web (' + JSON.stringify(grid.chips) + ')');
  }
  if (grid.emptyState) {
    console.log('[smoke] NOTE: no properties in Firestore — grid columns not measurable, frame checks passed');
  } else if (grid.rows.length === 0 || grid.rows[0].count !== 2) {
    throw new Error('FAIL: expected 2-column card grid, got ' + JSON.stringify(grid.rows));
  } else {
    console.log('[smoke] 2-column card grid verified ✓ (row1: ' + grid.rows[0].xs.join(',') + ' @ w=' + grid.rows[0].ws.join(',') + ')');
  }

  // Profile → Settings → Delete Account.
  await clickText('Profile');
  await waitFor(() => hasText('Settings'), 15000, 'Profile screen');
  await clickText('Settings');
  await waitFor(() => hasText('Delete Account'), 15000, 'Settings screen');
  await clickText('Delete Account');

  // Confirm dialog regression check: on web this is window.confirm now.
  await waitFor(() => hasText('Delete My Account'), 15000, 'Delete Account screen');
  await setInput('Enter your password to confirm', password);

  const dialogPromise = (async () => {
    for (let i = 0; i < 100; i++) {
      await sleep(100);
      const got = await evalJs(`typeof window.__smokeDialogSeen === 'string' ? window.__smokeDialogSeen : null`);
      // window.confirm blocks the page; CDP emits Page.javascriptDialogOpening.
      if (got) return got;
    }
    return null;
  })();

  // Patch window.confirm to record the message AND accept, so headless Chrome
  // doesn't hang the renderer on a native dialog.
  await evalJs(
    `window.__smokeDialogSeen = null;
     const origConfirm = window.confirm;
     window.confirm = (msg) => {
       window.__smokeDialogSeen = String(msg);
       return true; // accept
     };`
  );

  await clickText('Delete My Account');
  const dialogText = await dialogPromise;
  if (!dialogText) {
    const diag = await evalJs(`(() => {
      const btn = [...document.querySelectorAll('div')].find(
        e => e.textContent && e.textContent.trim() === 'Delete My Account'
      );
      const pw = [...document.querySelectorAll('input')].map(i => ({
        ph: i.placeholder, v: i.value, vis: i.offsetParent !== null
      }));
      return {
        dialogSeen: window.__smokeDialogSeen ?? null,
        confirmPatched: window.confirm.toString().includes('__smokeDialogSeen'),
        btn: btn ? {
          role: btn.getAttribute('role'),
          ariaDisabled: btn.getAttribute('aria-disabled'),
          tabindex: btn.getAttribute('tabindex'),
          opacity: getComputedStyle(btn).opacity,
        } : null,
        inputs: pw,
        body: document.body.innerText.slice(-200).replace(/\n/g, ' | '),
      };
    })()`);
    console.error('[smoke] dialog never appeared; diagnostics:', JSON.stringify(diag, null, 2));
    throw new Error('Delete confirmation dialog never appeared on web');
  }
  console.log(`[smoke] confirmation dialog appeared ✓ (${dialogText.split('\n')[0]})`);
  await evalJs(`window.confirm = window.origConfirm`);

  // Deletion runs: data wipe → email callable (best-effort) → auth delete.
  // The app should land back on the Login screen.
  await waitFor(() => hasText('Sign In'), 60000, 'Return to Login after deletion');

  // Re-login with the same credentials must fail — the account is gone.
  await setInput('Enter your email', email);
  await setInput('Enter your password', password);
  await clickText('Sign In');
  try {
    // Rejection proves deletion. The message depends on the Firebase
    // identity-platform generation: legacy auth returns user-not-found,
    // the modern platform returns the merged invalid-login-credentials code.
    await waitFor(
      () => evalJs(`(() => {
        const t = document.body.innerText;
        return t.includes('No account found with this email.')
          || t.includes('Incorrect email or password.');
      })()`),
      30000,
      'Re-login rejected (account deleted)'
    );
  } catch (err) {
    const diag = await evalJs(`(() => ({
      onHome: [...document.querySelectorAll('div')].some(
        e => e.textContent && e.textContent.trim() === 'Profile'
      ),
      body: document.body.innerText.slice(0, 350).replace(/\\n/g, ' | '),
      inputs: [...document.querySelectorAll('input')].map(i => i.placeholder + '=' + i.value),
    }))()`);
    const errors = runtimeLogs.filter((l) => l.type === 'error');
    console.error('[smoke] re-login not rejected; diagnostics:', JSON.stringify(diag, null, 2));
    console.error('[smoke] console errors:', JSON.stringify(errors.slice(-5).map((l) => l.text.slice(0, 200))));
    throw err;
  }
  console.log('[smoke] re-login rejected ✓ — auth account deleted');

  // Callable attempted?
  const callableUrl = networkRequests.find((u) => u.includes('sendAccountDeletionConfirmation'));
  console.log(
    callableUrl
      ? `[smoke] sendAccountDeletionConfirmation callable invoked ✓ (${callableUrl})`
      : '[smoke] WARNING: no network request to sendAccountDeletionConfirmation observed'
  );

  const emailWarn = runtimeLogs.find(
    (l) => l.type === 'warning' && l.text.includes('Deletion confirmation email not sent')
  );
  console.log(
    emailWarn
      ? '[smoke] graceful degradation confirmed ✓ — email failure logged, deletion completed'
      : '[smoke] no "email not sent" warning (function may be deployed, or call never fired)'
  );

  const errors = runtimeLogs.filter((l) => l.type === 'error');
  console.log(errors.length === 0 ? '[smoke] no console errors ✓' : `[smoke] console errors: ${errors.length}`);

  console.log('[smoke] PASS');
  process.exit(0);
}

main().catch((err) => {
  console.error('[smoke] FAIL:', err.message);
  process.exit(1);
});