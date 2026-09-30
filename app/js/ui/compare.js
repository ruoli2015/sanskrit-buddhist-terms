// Comparison page for confusable terms.
import { html } from '../../vendor/preact.js';
import { get as getContent } from '../content.js';
import { Bi, BiLong, Quote, L, Empty, lang } from './common.js';
import { reportUrl } from './term.js';

export function CompareTable({ table }) {
  if (!table) return null;
  const l = lang();
  const cell = (c) =>
    l === 'both'
      ? html`<span lang="zh-Hant">${c.zh}</span><span class="en">${c.en}</span>`
      : html`<span>${l === 'en' ? c.en : c.zh}</span>`;
  return html`<div class="table-wrap"><table class="cmp-table">
    <thead><tr><th></th>${table.columns.map((c) => html`<th>${cell(c)}</th>`)}</tr></thead>
    <tbody>${table.rows.map((r) => html`<tr><th scope="row">${cell(r.label)}</th>${r.cells.map((c) => html`<td>${cell(c)}</td>`)}</tr>`)}</tbody>
  </table></div>`;
}

export function CompareDetail({ id, inSheet = false, onNavigate }) {
  const content = getContent();
  const c = content.cmpById.get(id);
  if (!c) return html`<${Empty}>找不到這個比較 · Comparison not found</${Empty}>`;
  const link = (href) => (inSheet && onNavigate ? { href, onClick: (e) => { e.preventDefault(); onNavigate(href); } } : { href });
  return html`<article class="compare">
    <header>
      <div class="eyebrow"><${L} zh="易混淆比較" en="Comparison" /></div>
      <h1><${Bi} zh=${c.title_zh} en=${c.title_en} block /></h1>
      <div class="chips-sec">
        ${c.terms.map((tid) => content.terms.get(tid)).filter(Boolean).map((t) => html`<a class="chip" ...${link('#/term/' + t.id)}>${t.skt} ${t.zh}</a>`)}
      </div>
    </header>
    <section class="short"><${Bi} zh=${c.summary_zh} en=${c.summary_en} block /></section>
    <section><${CompareTable} table=${c.table} /></section>
    <section><h3><${L} zh="辨析" en="Explanation" /></h3><${BiLong} zh=${c.explanation_zh} en=${c.explanation_en} /></section>
    ${c.quotes?.length ? html`<section><h3><${L} zh="經論出處" en="Scripture" /></h3>${c.quotes.map((q) => html`<${Quote} q=${q} />`)}</section>` : null}
    ${!inSheet && c.questions?.length
      ? html`<a class="btn primary wide" href=${'#/session?cmp=' + encodeURIComponent(c.id)}><${L} zh=${`測驗我（${c.questions.length} 題）`} en="Test me" /></a>`
      : null}
    <footer class="term-foot"><a class="small" href=${reportUrl(c.title_zh, `comparison: ${c.id}`)} target="_blank" rel="noopener">⚑ 回報錯誤 Report an error</a></footer>
  </article>`;
}
