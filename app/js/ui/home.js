// Home: today's goal, streak, start buttons, quote of the day.
import { html } from '../../vendor/preact.js';
import * as store from '../store.js';
import { get as getContent } from '../content.js';
import { dailyCounts, streak } from '../stats.js';
import { dayKey, hashIndex } from '../util.js';
import { isIntroduced, dueAt, curriculumOrder } from '../srs.js';
import { L, Quote, ListProgress, Bi } from './common.js';

function Ring({ value, goal }) {
  const r = 34, c = 2 * Math.PI * r;
  const f = Math.min(1, goal ? value / goal : 0);
  return html`<svg class="ring" viewBox="0 0 80 80" role="img" aria-label=${`${value} of ${goal}`}>
    <circle cx="40" cy="40" r=${r} class="ring-bg" />
    <circle cx="40" cy="40" r=${r} class="ring-fg" stroke-dasharray=${`${c * f} ${c}`} transform="rotate(-90 40 40)" />
    <text x="40" y="38" text-anchor="middle" class="ring-n">${value}</text>
    <text x="40" y="54" text-anchor="middle" class="ring-g">/ ${goal}</text>
  </svg>`;
}

function quoteOfDay(content) {
  const pool = [];
  for (const t of content.terms.values()) for (const q of t.quotes || []) pool.push({ q, t });
  if (!pool.length) return null;
  return pool[hashIndex(dayKey(), pool.length)];
}

export function Home() {
  const content = getContent();
  const s = store.settings();
  const counts = dailyCounts(store.getReviews());
  const today = counts.get(dayKey())?.n || 0;
  const st = streak(counts);
  const now = Date.now();
  let due = 0;
  for (const t of content.terms.values()) {
    const p = store.progress('t:' + t.id);
    if (isIntroduced(p) && !p.retired && dueAt(p) <= now) due++;
  }
  for (const c of content.comparisons) {
    const p = store.progress('c:' + c.id);
    if (p?.card && dueAt(p) <= now) due++;
  }
  const newLeft = curriculumOrder(content, s).filter((id) => !isIntroduced(store.progress('t:' + id))).length;
  const newToday = Math.min(newLeft, Math.max(0, s.newPerDay - store.newIntroducedToday()));
  const qd = quoteOfDay(content);
  const goalMet = today >= s.dailyGoal;

  return html`<div class="page home">
    <section class="card today">
      <${Ring} value=${today} goal=${s.dailyGoal} />
      <div class="today-txt">
        <div class="streak">${st.days > 0 ? '🔥' : '·'} <b>${st.days}</b> <${L} zh="天連續" en="day streak" /></div>
        ${st.frozen.length ? html`<div class="small muted">❄︎ 已用凍結日 ${st.frozen.length} · freeze used</div>` : null}
        <div class="small">${goalMet ? '今日目標達成 🪷 Goal reached' : st.practicedToday ? '今天已開始，繼續加油 · keep going' : '今天還沒練習 · not practised today'}</div>
        <div class="small muted">待複習 ${due} due · 新詞 ${newToday} new</div>
      </div>
    </section>

    <section class="start">
      <a class="btn primary big" href=${`#/session?size=${s.sessionSize}&r=${now}`}>
        <${L} zh=${due || newToday ? `開始學習 · ${s.sessionSize} 題` : '今日已完成 · 加練'} en=${due || newToday ? 'Start session' : 'All done — practise more'} />
      </a>
      <div class="quick">
        <a class="btn ghost" href=${`#/session?size=5&r=${now}`}><${L} zh="1 分鐘" en="5 cards" /></a>
        <a class="btn ghost" href=${`#/session?size=15&r=${now}`}><${L} zh="3 分鐘" en="15 cards" /></a>
        <a class="btn ghost" href=${`#/session?size=40&r=${now}`}><${L} zh="10 分鐘" en="40 cards" /></a>
      </div>
      ${!due && !newToday ? html`<a class="small center" href=${`#/session?extra=1&size=10&r=${now}`}>提前複習學習中的詞 · Review learning words early</a>` : null}
    </section>

    ${qd
      ? html`<section class="card qotd">
          <div class="eyebrow"><${L} zh="今日一句" en="Verse of the day" /></div>
          <${Quote} q=${qd.q} />
          <a class="small" href=${'#/term/' + qd.t.id}>→ ${qd.t.skt} ${qd.t.zh} ${qd.t.en}</a>
        </section>`
      : null}

    <section class="card">
      <div class="eyebrow"><${L} zh="詞表進度" en="Lists" /></div>
      ${content.lists.filter((l) => !s.disabledLists.includes(l.id)).map((l) => html`<a class="list-mini" href=${'#/list/' + encodeURIComponent(l.id)}>
        <span><${Bi} zh=${l.zh} en=${l.en} /></span>
        <${ListProgress} ids=${[l.head, ...(l.items || [])].filter(Boolean)} />
      </a>`)}
    </section>
  </div>`;
}
