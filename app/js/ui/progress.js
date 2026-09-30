// Progress: streaks, heatmap, mastery per list, words often missed.
import { html } from '../../vendor/preact.js';
import * as store from '../store.js';
import { get as getContent } from '../content.js';
import { dailyCounts, streak, longestStreak, heatmap, leeches } from '../stats.js';
import { dayKey, addDays } from '../util.js';
import { L, Bi, ListProgress, TermRow, termStatus, STATUS_LABEL } from './common.js';

export function Progress() {
  const content = getContent();
  const s = store.settings();
  const reviews = store.getReviews();
  const counts = dailyCounts(reviews);
  const today = dayKey();
  const st = streak(counts);
  const cells = heatmap(counts, 18);
  const max = Math.max(s.dailyGoal, ...cells.map((c) => c.n));
  let n7 = 0, ok7 = 0;
  for (let i = 0; i < 7; i++) {
    const c = counts.get(addDays(today, -i));
    if (c) { n7 += c.n; ok7 += c.ok; }
  }
  const status = { new: 0, learning: 0, mastered: 0, retired: 0 };
  for (const t of content.terms.values()) status[termStatus(store.progress('t:' + t.id))]++;
  const often = leeches(store.listDocs('progress').filter(([k]) => k.startsWith('t:')))
    .map(([k]) => content.terms.get(k.slice(2)))
    .filter(Boolean)
    .slice(0, 10);
  const level = (n) => (n === 0 ? 0 : n < max * 0.25 ? 1 : n < max * 0.5 ? 2 : n < max ? 3 : 4);

  return html`<div class="page progress">
    <div class="tiles">
      <div class="tile"><b>🔥 ${st.days}</b><span>連續天數 streak</span></div>
      <div class="tile"><b>${longestStreak(counts)}</b><span>最長 longest</span></div>
      <div class="tile"><b>${counts.get(today)?.n || 0}/${s.dailyGoal}</b><span>今日 today</span></div>
      <div class="tile"><b>${n7 ? Math.round((ok7 / n7) * 100) : 0}%</b><span>7 日正確率 accuracy</span></div>
    </div>

    <section class="card">
      <div class="eyebrow"><${L} zh="練習紀錄" en="Practice history" /></div>
      <div class="heatmap" role="img" aria-label="practice heatmap">
        ${cells.map((c) => html`<span class=${`hm l${c.future ? 'f' : level(c.n)}`} title=${`${c.day}: ${c.n}`}></span>`)}
      </div>
      <div class="small muted">共 ${reviews.length} 次作答 · ${reviews.length} answers total · 每月有 2 天自動「凍結」保護連續紀錄 · 2 freeze days per month protect your streak</div>
    </section>

    <section class="card">
      <div class="eyebrow"><${L} zh="掌握程度" en="Mastery" /></div>
      <div class="status-row">
        ${Object.entries(status).map(([k, v]) => html`<span class=${`badge st-${k}`}>${STATUS_LABEL[k].zh} ${v}</span>`)}
      </div>
      ${content.lists.map((l) => html`<a class="list-mini" href=${'#/list/' + encodeURIComponent(l.id)}>
        <span><${Bi} zh=${l.zh} en=${l.en} /></span>
        <${ListProgress} ids=${[l.head, ...(l.items || [])].filter(Boolean)} />
      </a>`)}
      <p class="small muted">「已熟」＝已進入打字回想階段，且記憶穩定度 ≥ ${s.masteredStability} 天，或已退休。<br/>"Mastered" = in typed recall with memory stability ≥ ${s.masteredStability} days, or retired.</p>
    </section>

    ${often.length
      ? html`<section class="card">
          <div class="eyebrow"><${L} zh="常錯的詞" en="Often missed" /></div>
          ${often.map((t) => html`<${TermRow} t=${t} />`)}
          <p class="small muted">打開詞條看看記憶提示、筆記或比較卡。· Open them to review the memory aid, notes or comparison cards.</p>
        </section>`
      : null}
  </div>`;
}
