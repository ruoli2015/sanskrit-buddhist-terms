// Term detail page (also shown as a sheet during a session).
import { html, useState } from '../../vendor/preact.js';
import * as store from '../store.js';
import { get as getContent } from '../content.js';
import { Bi, BiLong, Quote, StageBadge, L, Md, Empty } from './common.js';
import { dueAt, isIntroduced, STAGE } from '../srs.js';
import { REPO_URL } from '../config.js';

function dueText(p) {
  if (!isIntroduced(p) || p.retired) return null;
  const ms = dueAt(p) - Date.now();
  if (ms <= 0) return '現在可複習 · due now';
  const h = ms / 3600000;
  if (h < 1) return `${Math.ceil(ms / 60000)} 分鐘後 · in ${Math.ceil(ms / 60000)} min`;
  if (h < 24) return `${Math.round(h)} 小時後 · in ${Math.round(h)} h`;
  return `${Math.round(h / 24)} 天後 · in ${Math.round(h / 24)} d`;
}

export function reportUrl(title, where) {
  const body = `**位置 Location:** ${where}\n\n**問題 What is wrong:**\n\n\n**建議 Suggested fix / source:**\n`;
  return `${REPO_URL}/issues/new?${new URLSearchParams({ title: `[內容] ${title}`, body, labels: 'content' })}`;
}

function NoteBox({ id, note }) {
  const [draft, setDraft] = useState(note);
  return html`<textarea class="note" rows="3" placeholder="寫下自己的理解… Your own notes…" value=${draft}
    onInput=${(e) => setDraft(e.target.value)}
    onBlur=${() => draft !== note && store.saveDoc('note', id, { text: draft })}></textarea>`;
}

export function TermDetail({ id, inSheet = false, onNavigate }) {
  const content = getContent();
  const t = content.terms.get(id);
  if (!t) return html`<${Empty}>找不到這個詞 · Term not found: ${id}</${Empty}>`;
  const p = store.progress('t:' + id);
  const s = store.settings();
  const note = store.getDoc('note', id)?.text || '';
  const lists = (content.termLists.get(id) || []).map((lid) => content.listById.get(lid)).filter(Boolean);
  const cmps = [...new Set([...(t.compare || []), ...(content.cmpByTerm.get(id) || [])])].map((cid) => content.cmpById.get(cid)).filter(Boolean);
  const link = (href) => (inSheet && onNavigate ? { href, onClick: (e) => { e.preventDefault(); onNavigate(href); } } : { href });

  const retire = async () => {
    const cur = store.progress('t:' + id);
    if (!cur) {
      // Retiring a word never studied: create progress so it is excluded from new words.
      const { newProgress } = await import('../srs.js');
      await store.setProgress('t:' + id, { ...newProgress(), retired: true });
    } else await store.setProgress('t:' + id, { ...cur, retired: !cur.retired });
  };

  return html`<article class="term">
    <header class="term-head">
      <div class="skt-big">${t.skt}</div>
      ${t.deva ? html`<div class="deva" lang="sa">${t.deva}</div>` : null}
      <div class="zh-big" lang="zh-Hant">${t.zh}</div>
      <div class="en-big">${t.en}</div>
      <div class="meta">
        ${t.pali ? html`<span>Pāli: <i>${t.pali}</i></span>` : null}
        ${t.zhAlt?.length ? html`<span lang="zh-Hant">亦譯：${t.zhAlt.join('、')}</span>` : null}
      </div>
      ${t.enAlt?.length ? html`<div class="meta">also: ${t.enAlt.slice(0, 6).join(', ')}</div>` : null}
      ${t.root ? html`<div class="root">${t.root}</div>` : null}
    </header>

    <section class="status-box">
      <${StageBadge} p=${p} />
      ${p && !p.retired && p.stage === STAGE.RECOGNIZE
        ? html`<span class="small">選擇題 ${p.mcqOk}/${s.mcqThreshold} · 天數 ${p.mcqDays?.length || 0}/${s.mcqMinDays}</span>`
        : null}
      ${dueText(p) ? html`<span class="small">${dueText(p)}</span>` : null}
      <button class="btn small ghost" onClick=${retire}>
        ${p?.retired ? html`<${L} zh="恢復學習" en="Un-retire" />` : html`<${L} zh="退休" en="Retire" />`}
      </button>
    </section>

    <section class="short"><${Bi} zh=${t.short_zh} en=${t.short_en} block /></section>

    ${t.detail_zh || t.detail_en
      ? html`<section><h3><${L} zh="深入解說" en="In depth" /></h3><${BiLong} zh=${t.detail_zh} en=${t.detail_en} /></section>`
      : null}

    ${t.schools?.length
      ? html`<section><h3><${L} zh="各派觀點" en="Schools" /></h3>
          <dl class="schools">${t.schools.map((sc) => html`<dt>${sc.name}</dt><dd><${Bi} zh=${sc.zh} en=${sc.en} block /></dd>`)}</dl>
        </section>`
      : null}

    ${t.quotes?.length
      ? html`<section><h3><${L} zh="經論出處" en="Scripture" /></h3>${t.quotes.map((q) => html`<${Quote} q=${q} />`)}</section>`
      : null}

    ${t.mnemonic_zh || t.mnemonic_en
      ? html`<section class="mnemonic"><h3><${L} zh="記憶提示" en="Memory aid" /></h3><${Bi} zh=${t.mnemonic_zh} en=${t.mnemonic_en} block /></section>`
      : null}

    ${cmps.length
      ? html`<section><h3><${L} zh="易混淆比較" en="Compare" /></h3>
          ${cmps.map((c) => html`<a class="cmp-card" ...${link('#/compare/' + c.id)}><b><${Bi} zh=${c.title_zh} en=${c.title_en} block /></b></a>`)}
        </section>`
      : null}

    ${lists.length || t.related?.length
      ? html`<section class="chips-sec">
          ${lists.map((l) => html`<a class="chip list" ...${link('#/list/' + encodeURIComponent(l.id))}>${l.zh} ${l.en !== l.zh ? l.en : ''}</a>`)}
          ${(t.related || []).map((rid) => content.terms.get(rid)).filter(Boolean).map((r) => html`<a class="chip" ...${link('#/term/' + r.id)}>${r.skt} ${r.zh}</a>`)}
        </section>`
      : null}

    <section>
      <h3><${L} zh="我的筆記" en="My notes" /></h3>
      <${NoteBox} key=${id} id=${id} note=${note} />
    </section>

    <footer class="term-foot">
      ${t.custom
        ? html`<a class="btn small ghost" href=${'#/add?edit=' + encodeURIComponent(id)}><${L} zh="編輯" en="Edit" /></a>`
        : html`<a class="small" href=${reportUrl(`${t.skt} ${t.zh}`, `term: ${id}`)} target="_blank" rel="noopener">⚑ 回報錯誤 Report an error</a>`}
    </footer>
  </article>`;
}
