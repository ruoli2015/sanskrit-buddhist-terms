// Shared UI pieces.
import { html, useState, useEffect } from '../../vendor/preact.js';
import { md, cbetaUrl, formatRef } from '../util.js';
import * as store from '../store.js';
import { STAGE_LABEL, isIntroduced, isMastered } from '../srs.js';

export const lang = () => store.settings().lang;

/** Bilingual text. In "both" mode Chinese first, English beneath (secondary). */
export function Bi({ zh, en, block = false, cls = '' }) {
  const l = lang();
  const Tag = block ? 'div' : 'span';
  if (l === 'zh' || !en) return html`<${Tag} class=${cls} lang="zh-Hant">${zh}</${Tag}>`;
  if (l === 'en' || !zh) return html`<${Tag} class=${cls} lang="en">${en}</${Tag}>`;
  return html`<${Tag} class=${`bi ${cls}`}><span lang="zh-Hant">${zh}</span>${block ? html`<span class="en" lang="en">${en}</span>` : html` <span class="en" lang="en">${en}</span>`}</${Tag}>`;
}

/** Fixed bilingual UI label, e.g. <L zh="學習" en="Study" /> — always shows both, compact. */
export const L = ({ zh, en }) => html`<span class="lbl"><span lang="zh-Hant">${zh}</span><span class="lbl-en" lang="en">${en}</span></span>`;

export const Md = ({ text, cls = '' }) => html`<div class=${`md ${cls}`} dangerouslySetInnerHTML=${{ __html: md(text) }} />`;

/** Long explanation with a 中 / EN / 中+EN switch, defaulting to the setting. */
export function BiLong({ zh, en }) {
  const [mode, setMode] = useState(lang());
  if (!zh && !en) return null;
  const btn = (m, label) => html`<button class=${`seg ${mode === m ? 'on' : ''}`} onClick=${() => setMode(m)}>${label}</button>`;
  return html`<div class="bilong">
    ${zh && en ? html`<div class="segs">${btn('zh', '中文')}${btn('en', 'English')}${btn('both', '中＋EN')}</div>` : null}
    ${mode !== 'en' && zh ? html`<${Md} text=${zh} cls="zh" />` : null}
    ${mode !== 'zh' && en ? html`<${Md} text=${en} cls="en-text" />` : null}
  </div>`;
}

export function Quote({ q, showTranslation = true }) {
  const l = lang();
  return html`<figure class="quote">
    <blockquote lang="zh-Hant">「${q.text}」</blockquote>
    <figcaption>
      <span class="src">${q.source}</span>
      ${q.ref ? html` · <a href=${cbetaUrl(q.ref)} target="_blank" rel="noopener" class="cbeta">${formatRef(q.ref)} ↗</a>` : null}
      ${l !== 'zh' && q.source_en ? html`<div class="src-en">${q.source_en}</div>` : null}
    </figcaption>
    ${showTranslation && l !== 'zh' && q.note_en ? html`<p class="qnote">${q.note_en}</p>` : null}
    ${showTranslation && l !== 'en' && q.note_zh ? html`<p class="qnote" lang="zh-Hant">${q.note_zh}</p>` : null}
  </figure>`;
}

export function termStatus(p) {
  if (!isIntroduced(p)) return 'new';
  if (p.retired) return 'retired';
  if (isMastered(p, store.settings())) return 'mastered';
  return 'learning';
}

export const STATUS_LABEL = {
  new: { zh: '未學', en: 'New' },
  learning: { zh: '學習中', en: 'Learning' },
  mastered: { zh: '已熟', en: 'Mastered' },
  retired: { zh: '已退休', en: 'Retired' },
};

export function StageBadge({ p }) {
  const s = termStatus(p);
  if (s === 'learning') {
    const st = STAGE_LABEL[p.stage];
    return html`<span class="badge st-learning">${st.zh} · ${st.en}</span>`;
  }
  return html`<span class=${`badge st-${s}`}>${STATUS_LABEL[s].zh} · ${STATUS_LABEL[s].en}</span>`;
}

export function TermRow({ t }) {
  const p = store.progress('t:' + t.id);
  const s = termStatus(p);
  return html`<a class="term-row" href=${'#/term/' + encodeURIComponent(t.id)}>
    <span class=${`dot st-${s}`} title=${STATUS_LABEL[s].en}></span>
    <span class="skt">${t.skt}</span>
    <span class="zh" lang="zh-Hant">${t.zh}</span>
    <span class="en">${t.en}</span>
  </a>`;
}

/** Stacked bar: mastered / learning / new (retired counted as mastered). */
export function ListProgress({ ids }) {
  const counts = { mastered: 0, learning: 0, new: 0 };
  for (const id of ids) {
    const s = termStatus(store.progress('t:' + id));
    counts[s === 'retired' ? 'mastered' : s]++;
  }
  const n = ids.length || 1;
  return html`<div class="lp">
    <div class="lp-bar">
      <span class="lp-m" style=${{ width: `${(counts.mastered / n) * 100}%` }}></span>
      <span class="lp-l" style=${{ width: `${(counts.learning / n) * 100}%` }}></span>
    </div>
    <div class="lp-txt">${counts.mastered} 熟 · ${counts.learning} 學 · ${counts.new} 新</div>
  </div>`;
}

export function Toast({ msg, onClose, action }) {
  useEffect(() => {
    if (!action) {
      const t = setTimeout(onClose, 3000);
      return () => clearTimeout(t);
    }
  }, [msg]);
  return html`<div class="toast" role="status">${msg}${action ? html` <button class="link" onClick=${action.fn}>${action.label}</button>` : null}
    <button class="toast-x" aria-label="close" onClick=${onClose}>×</button></div>`;
}

export function Sheet({ onClose, children }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    document.body.classList.add('noscroll');
    return () => {
      window.removeEventListener('keydown', k);
      document.body.classList.remove('noscroll');
    };
  }, []);
  return html`<div class="sheet-bg" onClick=${(e) => e.target === e.currentTarget && onClose()}>
    <div class="sheet" role="dialog">
      <button class="sheet-x" onClick=${onClose} aria-label="close">×</button>
      ${children}
    </div>
  </div>`;
}

export const Empty = ({ children }) => html`<div class="empty">${children}</div>`;
