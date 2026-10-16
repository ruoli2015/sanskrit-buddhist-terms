// Audiobooks: the list of books, and a book page with a tappable transcript and player controls.
// Books are private (see books.js); this page only shows what the signed-in account can read.
import { html, useState, useEffect, useRef, useMemo } from '../../vendor/preact.js';
import * as books from '../books.js';
import * as player from '../bookplayer.js';
import * as sync from '../sync.js';
import { verseNumbers, segmentAt } from '../bookplan.js';
import { L, Empty } from './common.js';

const pad = (n) => String(n).padStart(2, '0');
export function clock(s) {
  s = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}
const mb = (n) => `${(n / 1e6).toFixed(n < 1e7 ? 1 : 0)} MB`;

function usePlayer() {
  const [, set] = useState(0);
  useEffect(() => player.subscribe(() => set((x) => x + 1)), []);
  return player.state();
}

function SignInFirst() {
  return html`<div class="page"><div class="card"><${Empty}>
    有聲書只供已登入的帳號使用 · Audiobooks are available after signing in.<br />
    <a href="#/settings">→ 設定 Settings</a>
  </${Empty}></div></div>`;
}

export function BookList() {
  const signedIn = !!sync.getState().email;
  const [list, setList] = useState(null);
  const [err, setErr] = useState(null);
  const [saved, setSaved] = useState({});
  useEffect(() => {
    if (!signedIn) return;
    books.listBooks().then(async (l) => {
      setList(l);
      const s = {};
      for (const b of l) s[b.id] = await books.savedBytes(b.id).catch(() => 0);
      setSaved(s);
    }).catch((e) => setErr(e.message));
  }, [signedIn]);
  if (!signedIn) return html`<${SignInFirst} />`;
  return html`<div class="page books">
    <h2 class="sec-title"><${L} zh="有聲書" en="Audiobooks" /></h2>
    ${err ? html`<div class="card warn">${err}</div>` : null}
    ${!list && !err ? html`<div class="card"><${Empty}>載入中 · Loading…</${Empty}></div>` : null}
    ${list && !list.length ? html`<div class="card"><${Empty}>尚無有聲書 · No audiobooks yet</${Empty}></div>` : null}
    ${(list || []).map((b) => html`<a class="card book-card" href=${'#/book/' + encodeURIComponent(b.id)}>
      ${b.title_skt ? html`<div class="skt book-skt">${b.title_skt}</div>` : null}
      <div class="book-title"><span lang="zh-Hant">${b.title_zh}</span> <span class="muted">${b.title_en}</span></div>
      <div class="small muted">${clock(b.duration)} · ${mb(b.bytes)}${saved[b.id] ? ' · 已存於此裝置 saved on this device' : ''}</div>
    </a>`)}
  </div>`;
}

// ---------- transcript ----------
const SEG_LABEL = {
  grammar: ['整頌', 'The verse as a whole'],
  translation: ['譯文', 'Translation'],
  xuanzang: ['玄奘譯', 'Xuanzang'],
  repeat: ['再誦', 'Again'],
};

function Seg({ s, i }) {
  const lab = SEG_LABEL[s.kind] ? html`<div class="eyebrow"><${L} zh=${SEG_LABEL[s.kind][0]} en=${SEG_LABEL[s.kind][1]} /></div>` : null;
  switch (s.kind) {
    case 'intro': return html`<p class="bk-seg bk-intro" data-i=${i}>${s.text}</p>`;
    case 'section': return html`<h2 class="bk-seg bk-section" data-i=${i}><span lang="zh-Hant">${s.title_zh}</span> <span class="muted small">${s.title_en}</span></h2>`;
    case 'heading': return html`<h3 class="bk-seg bk-heading" data-i=${i} id=${'v-' + s.verse}>第 ${s.verse} 頌 · Verse ${s.verse}</h3>`;
    case 'verse':
    case 'repeat':
      return html`<div class=${`bk-seg bk-skt ${s.kind}`} data-i=${i}>${lab}<div class="skt">${s.lines[0]} /<br />${s.lines[1]} //</div></div>`;
    case 'word':
      return html`<div class="bk-seg bk-word" data-i=${i}>
        <div><b class="skt">${s.form}</b>${s.form !== s.skt ? html` <span class="skt muted">(${s.skt})</span>` : null}
          <span class="bk-gloss">${s.en} · <span lang="zh-Hant">${s.zh}</span></span></div>
        <div class="small bk-note">${s.note}</div>
      </div>`;
    case 'xuanzang':
      return html`<div class="bk-seg" data-i=${i}>${lab}<div lang="zh-Hant" class="bk-zh">${s.text}</div></div>`;
    default:
      return html`<div class="bk-seg" data-i=${i}>${lab}<div>${s.text}</div></div>`;
  }
}

function Transcript({ m }) {
  return html`<div class="card bk-transcript">${m.segments.map((s, i) => html`<${Seg} s=${s} i=${i} key=${i} />`)}</div>`;
}

const LOOP_LABEL = {
  off: '不循環 · No loop',
  book: '全書循環 · Whole book',
  verse: '本頌循環 · This verse',
  part: '本段循環 · This part',
  range: '數頌循環 · Verses…',
};
const RATES = [0.75, 1, 1.25];

function Controls({ m, st }) {
  const order = verseNumbers(m);
  const ready = st.book?.id === m.id && st.status === 'ready';
  const pct = Math.round((100 * st.loaded) / (m.bytes || 1));
  return html`<div class="bk-controls">
    ${st.status === 'loading' || (ready && !st.saved)
      ? html`<div class="small muted bk-status">首次播放，正在存到此裝置 ${pct}% · Saving to this device</div>`
      : null}
    ${st.error ? html`<div class="small warn bk-status">${st.error}</div>` : null}
    <input class="bk-seek" type="range" min="0" max=${m.duration} step="0.5" value=${st.t} disabled=${!ready}
      aria-label="position" onInput=${(e) => player.seek(+e.target.value, { play: false })} />
    <div class="bk-row">
      <span class="small muted bk-time">${clock(st.t)}</span>
      <button class="btn ghost bk-btn" disabled=${!ready} onClick=${() => player.skipVerse(-1)} aria-label="previous verse">⏮</button>
      <button class="btn primary bk-play" disabled=${!ready} onClick=${() => player.toggle()} aria-label=${st.playing ? 'pause' : 'play'}>${st.playing ? '❚❚' : '▶'}</button>
      <button class="btn ghost bk-btn" disabled=${!ready} onClick=${() => player.skipVerse(1)} aria-label="next verse">⏭</button>
      <span class="small muted bk-time right">${clock(m.duration)}</span>
    </div>
    <div class="bk-row bk-opts">
      <select value=${st.loop} onChange=${(e) => player.setLoop(e.target.value)} aria-label="loop">
        ${Object.entries(LOOP_LABEL).map(([k, v]) => html`<option value=${k}>${v}</option>`)}
      </select>
      <button class="btn small ghost" onClick=${() => player.setRate(RATES[(RATES.indexOf(st.rate) + 1) % RATES.length])}>${st.rate}×</button>
      <label class="toggle small"><input type="checkbox" checked=${st.sktOnly} onChange=${(e) => player.setSktOnly(e.target.checked)} /> 只聽梵文 Sanskrit only</label>
    </div>
    ${st.loop === 'range'
      ? html`<div class="bk-row bk-opts small">
          第 <select value=${st.from} onChange=${(e) => player.setRange(+e.target.value, Math.max(+e.target.value, st.to))}>${order.map((n) => html`<option value=${n}>${n}</option>`)}</select>
          至 <select value=${st.to} onChange=${(e) => player.setRange(Math.min(st.from, +e.target.value), +e.target.value)}>${order.map((n) => html`<option value=${n}>${n}</option>`)}</select>
          頌 · verses
        </div>`
      : null}
  </div>`;
}

export function BookPage({ id }) {
  const signedIn = !!sync.getState().email;
  const st = usePlayer();
  const [m, setM] = useState(st.book?.id === id ? st.book : null);
  const [err, setErr] = useState(null);
  const [saved, setSaved] = useState(0);
  const box = useRef(null);
  const lastScroll = useRef(0);

  useEffect(() => {
    if (!signedIn) return;
    books.getManifest(id).then((mm) => { setM(mm); player.open(mm); }).catch((e) => setErr(e.message));
  }, [id, signedIn]);
  useEffect(() => { books.savedBytes(id).then(setSaved).catch(() => {}); }, [id, st.saved]);
  useEffect(() => {
    const mark = () => { lastScroll.current = Date.now(); };
    window.addEventListener('touchmove', mark, { passive: true });
    window.addEventListener('wheel', mark, { passive: true });
    return () => { window.removeEventListener('touchmove', mark); window.removeEventListener('wheel', mark); };
  }, []);

  // Highlight the line being played (directly in the DOM: the transcript is long and static).
  const active = m && st.book?.id === m.id ? segmentAt(m, st.t) : -1;
  useEffect(() => {
    const root = box.current;
    if (!root) return;
    root.querySelector('.bk-seg.on')?.classList.remove('on');
    const el = root.querySelector(`[data-i="${active}"]`);
    if (!el) return;
    el.classList.add('on');
    if (st.playing && Date.now() - lastScroll.current > 6000) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [active, m]);

  const transcript = useMemo(() => (m ? html`<${Transcript} m=${m} />` : null), [m]);
  if (!signedIn) return html`<${SignInFirst} />`;
  if (err) return html`<div class="page"><div class="card warn">${err}</div></div>`;
  if (!m) return html`<div class="page"><div class="card"><${Empty}>載入中 · Loading…</${Empty}></div></div>`;

  // Tapping a line plays from there (synchronously: play() must stay inside the tap).
  const onTap = (e) => {
    const el = e.target.closest('[data-i]');
    if (el && st.book?.id === m.id && st.status === 'ready') player.seek(m.segments[+el.dataset.i].start);
  };
  const del = () => {
    if (!confirm('從此裝置刪除這本有聲書的音檔？之後再播放會重新下載。\nDelete this audiobook from this device? It downloads again the next time you play it.')) return;
    player.deleteSaved(m.id).then(() => { setSaved(0); window.__toast?.('已刪除 · Deleted'); });
  };
  return html`<div class="page book-page">
    <div class="card">
      ${m.title_skt ? html`<div class="skt book-skt">${m.title_skt}</div>` : null}
      <h1><span lang="zh-Hant">${m.title_zh}</span> <span class="muted small">${m.title_en}</span></h1>
      <div class="small muted">${clock(m.duration)} · ${mb(m.bytes)}</div>
      <div class="bk-verses">${verseNumbers(m).map((n) => html`<a href=${'#v-' + n} onClick=${(e) => { e.preventDefault(); document.getElementById('v-' + n)?.scrollIntoView({ block: 'start', behavior: 'smooth' }); lastScroll.current = Date.now(); }}>${n}</a>`)}</div>
      ${saved
        ? html`<div class="row small"><span class="muted">已存於此裝置 · Saved on this device (${mb(saved)})</span>
            <button class="btn small danger" onClick=${del}>刪除 Delete</button></div>`
        : null}
      <p class="small muted">點任一行即從該處播放 · Tap any line to play from there.</p>
    </div>
    <div ref=${box} onClick=${onTap}>${transcript}</div>
    <${Controls} m=${m} st=${st} />
  </div>`;
}

/** Small bar on other pages while a book is playing. */
export function MiniPlayer() {
  const st = usePlayer();
  if (!st.book || !st.playing) return null;
  const v = st.book.segments[segmentAt(st.book, st.t)]?.verse;
  return html`<a class="mini-player" href=${'#/book/' + encodeURIComponent(st.book.id)}>
    <button class="bk-mini-btn" aria-label="pause" onClick=${(e) => { e.preventDefault(); e.stopPropagation(); player.toggle(); }}>❚❚</button>
    <span class="mini-title">${st.book.title_skt || st.book.title_zh}${v ? ` · ${v}` : ''}</span>
    <span class="small muted">${clock(st.t)}</span>
  </a>`;
}
