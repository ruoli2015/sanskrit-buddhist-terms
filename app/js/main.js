// App entry: load data, route, render.
import { html, render, useState, useEffect } from '../vendor/preact.js';
import * as store from './store.js';
import * as sync from './sync.js';
import { loadBase } from './content.js';
import { Home } from './ui/home.js';
import { Session } from './ui/session.js';
import { Browse, ListView } from './ui/browse.js';
import { TermDetail } from './ui/term.js';
import { CompareDetail } from './ui/compare.js';
import { Add } from './ui/add.js';
import { Progress } from './ui/progress.js';
import { Settings } from './ui/settings.js';
import { Toast } from './ui/common.js';

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = h.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  return { parts, params: Object.fromEntries(new URLSearchParams(query)), key: h };
}

const NAV = [
  ['', '🏠', '學習', 'Study'],
  ['browse', '📖', '瀏覽', 'Browse'],
  ['add', '＋', '新增', 'Add'],
  ['progress', '📈', '進度', 'Progress'],
  ['settings', '⚙︎', '設定', 'Settings'],
];

function App() {
  const [route, setRoute] = useState(parseHash());
  const [, setTick] = useState(0);
  const [toast, setToast] = useState(null);
  useEffect(() => {
    const onHash = () => {
      setRoute(parseHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    const unsub = store.subscribe(() => setTick((t) => t + 1));
    const unsubSync = sync.subscribe(() => setTick((t) => t + 1));
    window.__showUpdate = (fn) => setToast({ msg: '有新版本 · New version available', action: { label: '更新 Reload', fn } });
    return () => { window.removeEventListener('hashchange', onHash); unsub(); unsubSync(); };
  }, []);

  const [p0, p1] = route.parts;
  let page;
  if (!p0) page = html`<${Home} />`;
  else if (p0 === 'session') page = html`<${Session} key=${route.key} params=${route.params} />`;
  else if (p0 === 'browse') page = html`<${Browse} params=${route.params} />`;
  else if (p0 === 'list') page = html`<${ListView} id=${p1} />`;
  else if (p0 === 'term') page = html`<div class="page"><div class="card"><${TermDetail} key=${p1} id=${p1} /></div></div>`;
  else if (p0 === 'compare') page = html`<div class="page"><div class="card"><${CompareDetail} id=${p1} /></div></div>`;
  else if (p0 === 'add') page = html`<${Add} key=${route.key} params=${route.params} />`;
  else if (p0 === 'progress') page = html`<${Progress} />`;
  else if (p0 === 'settings') page = html`<${Settings} />`;
  else page = html`<${Home} />`;

  const inSession = p0 === 'session';
  const syncState = sync.getState();
  return html`
    ${!inSession
      ? html`<header class="top">
          ${p0 && p0 !== 'browse' && p0 !== 'add' && p0 !== 'progress' && p0 !== 'settings'
            ? html`<button class="back" onClick=${() => history.back()} aria-label="back">‹</button>`
            : html`<span class="logo" aria-hidden="true">☸</span>`}
          <span class="title">梵語佛學名相 <small>Sanskrit Buddhist Terms</small></span>
          <span class=${`sync-dot s-${syncState.status}`} title=${syncState.status}></span>
        </header>`
      : null}
    <main>${page}</main>
    ${!inSession
      ? html`<nav class="tabs">
          ${NAV.map(([path, icon, zh, en]) => {
            const on = (p0 || '') === path || (path === 'browse' && ['list', 'term', 'compare'].includes(p0));
            return html`<a class=${on ? 'on' : ''} href=${'#/' + path}><span class="ic">${icon}</span><span class="tz">${zh}</span><span class="te">${en}</span></a>`;
          })}
        </nav>`
      : null}
    ${toast ? html`<${Toast} ...${toast} onClose=${() => setToast(null)} />` : null}
  `;
}

async function registerSW() {
  if (!('serviceWorker' in navigator) || location.hostname === 'localhost' && location.search.includes('nosw')) return;
  try {
    const reg = await navigator.serviceWorker.register('sw.js');
    const promptUpdate = (w) => window.__showUpdate?.(() => w.postMessage('skipWaiting'));
    if (reg.waiting && navigator.serviceWorker.controller) promptUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) promptUpdate(w);
      });
    });
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!reloaded) { reloaded = true; location.reload(); }
    });
    // Check for updates whenever the app comes back to the foreground.
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && reg.update().catch(() => {}));
  } catch (e) {
    console.warn('service worker registration failed', e);
  }
}

async function start() {
  try {
    await Promise.all([store.load(), loadBase()]);
  } catch (e) {
    document.getElementById('app').innerHTML = `<p style="padding:2rem">載入失敗 · Failed to load: ${e.message}</p>`;
    throw e;
  }
  const root = document.getElementById('app');
  root.textContent = '';
  render(html`<${App} />`, root);
  sync.init().catch((e) => console.warn('sync init failed', e));
  registerSW();
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
}

start();
