// Browse: search, lists, comparisons, retired words.
import { html, useState } from '../../vendor/preact.js';
import * as store from '../store.js';
import { get as getContent, search } from '../content.js';
import { L, Bi, TermRow, ListProgress, Empty, termStatus } from './common.js';

export function Browse({ params }) {
  const content = getContent();
  const [q, setQ] = useState(params.q || '');
  const s = store.settings();
  const results = q.trim() ? search(content, q) : null;
  const retired = [...content.terms.values()].filter((t) => termStatus(store.progress('t:' + t.id)) === 'retired');

  return html`<div class="page browse">
    <div class="search">
      <input type="search" placeholder="搜尋 梵 / 中 / English（可不打變音符號）" value=${q}
        autocomplete="off" autocapitalize="off" spellcheck="false" onInput=${(e) => setQ(e.target.value)} />
    </div>
    ${results
      ? html`<section class="card">${results.length ? results.map((t) => html`<${TermRow} t=${t} />`) : html`<${Empty}>沒有結果 · No results</${Empty}>`}</section>`
      : html`
        <h2 class="sec-title"><${L} zh="詞表" en="Lists" /></h2>
        ${content.lists.map((l) => {
          const ids = [l.head, ...(l.items || [])].filter(Boolean);
          const off = s.disabledLists.includes(l.id);
          return html`<a class=${`card list-card ${off ? 'off' : ''}`} href=${'#/list/' + encodeURIComponent(l.id)}>
            <div class="list-title"><${Bi} zh=${l.zh} en=${l.en} /> ${l.skt ? html`<span class="skt small">${l.skt}</span>` : null}
              ${off ? html`<span class="badge">暫停 paused</span>` : null}</div>
            <${ListProgress} ids=${ids} />
            <div class="chips">${ids.map((id) => content.terms.get(id)).filter(Boolean).map((t) => html`<span class=${`chip st-${termStatus(store.progress('t:' + t.id))}`}>${t.zh}</span>`)}</div>
          </a>`;
        })}
        <h2 class="sec-title"><${L} zh="易混淆比較" en="Comparisons" /></h2>
        ${content.comparisons.map((c) => html`<a class="card cmp-card" href=${'#/compare/' + encodeURIComponent(c.id)}>
          <b><${Bi} zh=${c.title_zh} en=${c.title_en} block /></b>
          <div class="small muted">${c.questions?.length || 0} 題 questions</div>
        </a>`)}
        ${retired.length
          ? html`<details class="card"><summary><${L} zh=${`已退休（${retired.length}）`} en="Retired" /></summary>${retired.map((t) => html`<${TermRow} t=${t} />`)}</details>`
          : null}
      `}
  </div>`;
}

export function ListView({ id }) {
  const content = getContent();
  const l = content.listById.get(id);
  if (!l) return html`<div class="page"><${Empty}>找不到詞表 · List not found</${Empty}></div>`;
  const s = store.settings();
  const off = s.disabledLists.includes(l.id);
  const ids = [l.head, ...(l.items || [])].filter(Boolean);
  const toggle = () =>
    store.saveSettings({ disabledLists: off ? s.disabledLists.filter((x) => x !== l.id) : [...s.disabledLists, l.id] });
  return html`<div class="page">
    <div class="card">
      <h1><${Bi} zh=${l.zh} en=${l.en} block /></h1>
      ${l.skt ? html`<div class="skt">${l.skt}</div>` : null}
      ${l.summary_zh || l.summary_en ? html`<p><${Bi} zh=${l.summary_zh} en=${l.summary_en} block /></p>` : null}
      <${ListProgress} ids=${ids} />
      <label class="toggle"><input type="checkbox" checked=${!off} onChange=${toggle} /> <${L} zh="學習這個詞表的新詞" en="Introduce new words from this list" /></label>
    </div>
    <div class="card">
      ${ids.map((tid, i) => content.terms.get(tid)).filter(Boolean).map((t, i) => html`<div class="numbered">${l.ordered && t.id !== l.head ? html`<span class="num">${l.items.indexOf(t.id) + 1}</span>` : html`<span class="num">·</span>`}<${TermRow} t=${t} /></div>`)}
    </div>
    ${l.items?.length >= 3 && l.ordered ? html`<p class="small muted center">此表有固定次序 · canonical order shown</p>` : null}
  </div>`;
}
