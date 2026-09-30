// A study session: a short queue of intro cards, term questions and comparison questions.
import { html, useState, useEffect, useRef, useMemo } from '../../vendor/preact.js';
import * as store from '../store.js';
import * as sync from '../sync.js';
import { get as getContent } from '../content.js';
import {
  buildSession, makeTermQuestion, makeCompareQuestion, applyTermAnswer, applyCompareAnswer,
  newProgress, STAGE, STAGE_LABEL,
} from '../srs.js';
import { matchZh, matchEn, matchSkt } from '../grade.js';
import { dailyCounts, streak } from '../stats.js';
import { dayKey } from '../util.js';
import { Bi, L, Quote, Sheet, lang } from './common.js';
import { TermDetail } from './term.js';
import { CompareDetail, CompareTable } from './compare.js';

const PROMPT_LABEL = {
  zh: { zh: '選出中文', en: 'Choose the Chinese' },
  en: { zh: '選出英文', en: 'Choose the English' },
  skt: { zh: '選出梵語', en: 'Choose the Sanskrit' },
};

function initialQueue(params) {
  const content = getContent();
  if (params.cmp) {
    const c = content.cmpById.get(params.cmp);
    if (!c) return [];
    return [...c.questions.keys()].sort(() => Math.random() - 0.5).map((qIndex) => ({ kind: 'compare', id: c.id, qIndex }));
  }
  if (params.term) return [{ kind: 'term', id: params.term }];
  const s = store.settings();
  return buildSession({
    content,
    prog: store.progress,
    settings: s,
    size: +params.size || s.sessionSize,
    newToday: store.newIntroducedToday(),
    extra: params.extra === '1',
  });
}

export function Session({ params }) {
  const [queue, setQueue] = useState(() => initialQueue(params));
  const [pos, setPos] = useState(0);
  const [results, setResults] = useState({ n: 0, ok: 0, promoted: [], newTerms: 0 });
  const [sheet, setSheet] = useState(null); // { kind: 'term'|'compare', id }
  const requeued = useRef(new Set());
  const item = queue[pos];
  const done = pos >= queue.length;

  useEffect(() => {
    if (done && results.n) sync.schedule(500);
  }, [done]);

  const next = () => setPos((p) => p + 1);
  const insertLater = (it, gap) =>
    setQueue((q) => {
      const copy = q.slice();
      copy.splice(Math.min(copy.length, pos + gap), 0, it);
      return copy;
    });

  const record = async (res) => {
    // res: { item, correct, partial, mode, promoted?, termId? }
    setResults((r) => ({
      ...r,
      n: r.n + 1,
      ok: r.ok + (res.correct ? 1 : 0),
      promoted: res.event === 'promoted' ? [...r.promoted, res.label] : r.promoted,
    }));
    if (!res.correct && !requeued.current.has(res.key)) {
      requeued.current.add(res.key);
      insertLater(res.again, 4);
    }
  };

  if (!queue.length) {
    return html`<div class="page session-empty">
      <h2><${L} zh="目前沒有要複習的詞" en="Nothing due right now" /></h2>
      <p class="muted">新詞今天已達上限，或所有詞都已退休。<br/>No reviews due, and today's new words are done.</p>
      <a class="btn primary wide" href="#/session?extra=1&size=10"><${L} zh="加練 10 題" en="Practice 10 more" /></a>
      <a class="btn ghost wide" href="#/"><${L} zh="回首頁" en="Home" /></a>
    </div>`;
  }

  if (done) return html`<${Summary} results=${results} params=${params} />`;

  const content = getContent();
  let body;
  if (item.kind === 'intro') {
    body = html`<${IntroCard} key=${pos} id=${item.id} onDone=${async () => {
      await store.setProgress('t:' + item.id, newProgress());
      setResults((r) => ({ ...r, newTerms: r.newTerms + 1 }));
      insertLater({ kind: 'term', id: item.id }, 3);
      next();
    }} />`;
  } else if (item.kind === 'compare-intro') {
    body = html`<${CompareIntro} key=${pos} id=${item.id} onDetails=${() => setSheet({ kind: 'compare', id: item.id })}
      onDone=${() => setQueue((q) => q.map((x, i) => (i === pos ? { kind: 'compare', id: item.id } : x)))} />`;
  } else if (item.kind === 'compare') {
    const c = content.cmpById.get(item.id);
    body = c
      ? html`<${CompareQuestion} key=${pos + item.id} cmp=${c} qIndex=${item.qIndex} onRecord=${record} onNext=${next}
          onDetails=${() => setSheet({ kind: 'compare', id: c.id })} />`
      : null;
  } else {
    const t = content.terms.get(item.id);
    body = t
      ? html`<${TermQuestion} key=${pos + item.id} term=${t} onRecord=${record} onNext=${next}
          onDetails=${() => setSheet({ kind: 'term', id: t.id })} />`
      : null;
    if (!t) setTimeout(next, 0);
  }

  return html`<div class="page session">
    <div class="session-top">
      <a class="close" href="#/" aria-label="end session">×</a>
      <div class="pbar"><span style=${{ width: `${(pos / queue.length) * 100}%` }}></span></div>
      <span class="count">${pos + 1}/${queue.length}</span>
    </div>
    ${body}
    ${sheet
      ? html`<${Sheet} onClose=${() => setSheet(null)}>
          ${sheet.kind === 'term'
            ? html`<${TermDetail} id=${sheet.id} inSheet onNavigate=${(href) => navInSheet(href, setSheet)} />`
            : html`<${CompareDetail} id=${sheet.id} inSheet onNavigate=${(href) => navInSheet(href, setSheet)} />`}
        </${Sheet}>`
      : null}
  </div>`;
}

function navInSheet(href, setSheet) {
  const m = /^#\/(term|compare|list)\/(.+)$/.exec(href);
  if (m && m[1] !== 'list') setSheet({ kind: m[1], id: decodeURIComponent(m[2]) });
}

// ---------------- Intro ----------------

function IntroCard({ id, onDone }) {
  const t = getContent().terms.get(id);
  useEnter(onDone);
  if (!t) return null;
  const q = t.quotes?.[0];
  return html`<div class="card intro">
    <div class="eyebrow"><${L} zh="新詞" en="New term" /></div>
    <div class="skt-big">${t.skt}</div>
    ${t.deva ? html`<div class="deva" lang="sa">${t.deva}</div>` : null}
    <div class="zh-big" lang="zh-Hant">${t.zh}</div>
    <div class="en-big">${t.en}</div>
    ${t.root ? html`<div class="root">${t.root}</div>` : null}
    <div class="short"><${Bi} zh=${t.short_zh} en=${t.short_en} block /></div>
    ${q ? html`<${Quote} q=${q} showTranslation=${false} />` : null}
    ${t.mnemonic_zh || t.mnemonic_en ? html`<div class="mnemonic small"><${Bi} zh=${t.mnemonic_zh} en=${t.mnemonic_en} block /></div>` : null}
    <button class="btn primary wide" onClick=${onDone}><${L} zh="記住了，開始練習" en="Got it — practice" /></button>
  </div>`;
}

function CompareIntro({ id, onDone, onDetails }) {
  const c = getContent().cmpById.get(id);
  useEnter(onDone);
  if (!c) return null;
  return html`<div class="card intro">
    <div class="eyebrow"><${L} zh="新的比較" en="New comparison" /></div>
    <h2><${Bi} zh=${c.title_zh} en=${c.title_en} block /></h2>
    <div class="short"><${Bi} zh=${c.summary_zh} en=${c.summary_en} block /></div>
    <${CompareTable} table=${c.table} />
    <button class="btn ghost wide" onClick=${onDetails}><${L} zh="閱讀完整辨析" en="Read the full explanation" /></button>
    <button class="btn primary wide" onClick=${onDone}><${L} zh="測驗我" en="Test me" /></button>
  </div>`;
}

// ---------------- Term questions ----------------

function TermQuestion({ term, onRecord, onNext, onDetails }) {
  const content = getContent();
  const settings = store.settings();
  const key = 't:' + term.id;
  const prog = store.progress(key);
  const q = useMemo(() => makeTermQuestion(content, term, prog, settings), [term.id]);
  const [answer, setAnswer] = useState(null); // { correct, partial, detail }
  const [override, setOverride] = useState(false);
  const saved = useRef(false); // the answer is applied when moving on, so "I was right" can still correct it
  const latest = useRef({});
  latest.current = { answer, override };

  const commit = async () => {
    const { answer: a, override: ov } = latest.current;
    if (!a || saved.current) return;
    saved.current = true;
    const correct = a.correct || ov;
    const { progress, event } = applyTermAnswer(prog, { mode: q.mode, correct, partial: !correct && a.partial }, settings);
    await store.setProgress(key, progress);
    await store.addReview({ item: key, correct, mode: q.mode, stage: progress.stage });
    onRecord({
      key, correct, event,
      label: `${term.skt} → ${STAGE_LABEL[progress.stage].zh} ${STAGE_LABEL[progress.stage].en}`,
      again: { kind: 'term', id: term.id },
    });
  };

  // Save a pending answer if the app is backgrounded or the session is left mid-feedback.
  useEffect(() => {
    const h = () => document.visibilityState === 'hidden' && commit();
    document.addEventListener('visibilitychange', h);
    return () => {
      document.removeEventListener('visibilitychange', h);
      commit();
    };
  }, []);

  const goNext = async () => {
    await commit();
    onNext();
  };

  let ask;
  if (q.mode === 'mcq' || q.mode === 'cloze') {
    ask = html`<${Mcq} q=${q} term=${term} answer=${answer}
      onAnswer=${(i) => setAnswer({ correct: i === q.answer, chosen: i })} />`;
  } else if (q.mode === 'typed') {
    ask = html`<${Typed} term=${term} answer=${answer} s2t=${content.s2t} onAnswer=${setAnswer} />`;
  } else {
    ask = html`<${Produce} term=${term} answer=${answer} onAnswer=${setAnswer} />`;
  }

  return html`<div class="card question">
    ${ask}
    ${answer
      ? html`<${Feedback} term=${term} answer=${answer} override=${override} mode=${q.mode}
          onOverride=${answer.correct || q.mode === 'mcq' || q.mode === 'cloze' ? null : () => setOverride(true)}
          onNext=${goNext} onDetails=${onDetails} />`
      : null}
  </div>`;
}

function Mcq({ q, term, answer, onAnswer }) {
  useEffect(() => {
    const k = (e) => {
      if (answer || e.target.tagName === 'INPUT') return;
      const n = +e.key;
      if (n >= 1 && n <= q.options.length) onAnswer(n - 1);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [answer]);

  let prompt;
  if (q.mode === 'cloze') {
    prompt = html`<div class="eyebrow"><${L} zh="經文填空" en="Fill the blank in the scripture" /></div>
      <blockquote class="cloze" lang="zh-Hant">「${q.cloze.text}」</blockquote>
      <div class="small muted">${q.cloze.quote.source}</div>`;
  } else {
    const label = PROMPT_LABEL[q.to];
    prompt = html`<div class="eyebrow"><${L} zh=${label.zh} en=${label.en} /></div>
      ${q.from === 'skt'
        ? html`<div class="skt-big">${term.skt}</div>${term.deva ? html`<div class="deva" lang="sa">${term.deva}</div>` : null}`
        : q.from === 'zh'
          ? html`<div class="zh-big" lang="zh-Hant">${term.zh}</div>`
          : html`<div class="en-big prompt-en">${term.en}</div>`}`;
  }
  const cls = (i) => {
    if (!answer) return 'opt';
    if (i === q.answer) return 'opt right';
    if (i === answer.chosen) return 'opt wrong';
    return 'opt dim';
  };
  return html`<div class="ask">
    ${prompt}
    <div class="opts">
      ${q.options.map((o, i) => html`<button class=${cls(i)} disabled=${!!answer} onClick=${() => onAnswer(i)}>
        <span class="key">${i + 1}</span><span class=${q.to === 'skt' ? 'skt' : q.to === 'zh' ? 'zh' : ''} lang=${q.to === 'zh' ? 'zh-Hant' : undefined}>${o.text}</span>
      </button>`)}
    </div>
  </div>`;
}

function Typed({ term, answer, s2t, onAnswer }) {
  const [zh, setZh] = useState('');
  const [en, setEn] = useState('');
  const zhRef = useRef();
  const enRef = useRef();
  useEffect(() => zhRef.current?.focus(), []);
  const submit = (e) => {
    e?.preventDefault();
    if (answer || (!zh.trim() && !en.trim())) return;
    const zhOk = matchZh(zh, [term.zh, ...(term.zhAlt || [])], s2t);
    const enOk = matchEn(en, [term.en, ...(term.enAlt || [])]);
    onAnswer({ correct: zhOk && enOk, partial: zhOk || enOk, detail: { zh, en, zhOk, enOk } });
  };
  const mark = (ok) => (answer ? (ok ? ' ok' : ' bad') : '');
  return html`<form class="ask" onSubmit=${submit}>
    <div class="eyebrow"><${L} zh="寫出中文與英文" en="Type the Chinese and English" /></div>
    <div class="skt-big">${term.skt}</div>
    ${term.deva ? html`<div class="deva" lang="sa">${term.deva}</div>` : null}
    <label class=${'field' + mark(answer?.detail?.zhOk)}>
      <span>中文</span>
      <input ref=${zhRef} lang="zh-Hant" value=${zh} disabled=${!!answer} autocomplete="off" autocapitalize="off" spellcheck="false"
        enterkeyhint="next" onInput=${(e) => setZh(e.target.value)}
        onKeyDown=${(e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); enRef.current?.focus(); } }} />
    </label>
    <label class=${'field' + mark(answer?.detail?.enOk)}>
      <span>English</span>
      <input ref=${enRef} lang="en" value=${en} disabled=${!!answer} autocomplete="off" autocapitalize="off" spellcheck="false"
        enterkeyhint="done" onInput=${(e) => setEn(e.target.value)} />
    </label>
    ${!answer ? html`<button class="btn primary wide" type="submit"><${L} zh="確認" en="Check" /></button>` : null}
  </form>`;
}

function Produce({ term, answer, onAnswer }) {
  const [v, setV] = useState('');
  const ref = useRef();
  useEffect(() => ref.current?.focus(), []);
  const submit = (e) => {
    e?.preventDefault();
    if (answer || !v.trim()) return;
    const ok = matchSkt(v, [term.skt]);
    onAnswer({ correct: ok, partial: false, detail: { skt: v, sktOk: ok } });
  };
  return html`<form class="ask" onSubmit=${submit}>
    <div class="eyebrow"><${L} zh="寫出梵語" en="Type the Sanskrit" /></div>
    <div class="zh-big" lang="zh-Hant">${term.zh}</div>
    <div class="en-big">${term.en}</div>
    <label class=${'field' + (answer ? (answer.correct ? ' ok' : ' bad') : '')}>
      <span>Sanskrit</span>
      <input ref=${ref} value=${v} disabled=${!!answer} autocomplete="off" autocapitalize="off" spellcheck="false"
        placeholder="e.g. samskara / saṃskāra" onInput=${(e) => setV(e.target.value)} />
    </label>
    <div class="small muted">可不打變音符號 · diacritics optional</div>
    ${!answer ? html`<button class="btn primary wide" type="submit"><${L} zh="確認" en="Check" /></button>` : null}
  </form>`;
}

function Feedback({ term, answer, override, mode, onOverride, onNext, onDetails }) {
  useEnter(onNext, 150);
  const ok = answer.correct || override;
  const d = answer.detail || {};
  const alt = (arr) => (arr?.length ? html`<span class="alt">（${arr.slice(0, 5).join(lang() === 'en' ? ', ' : '、')}）</span>` : null);
  const [retired, setRetired] = useState(false);
  const retire = async () => {
    const p = store.progress('t:' + term.id);
    if (p) await store.setProgress('t:' + term.id, { ...p, retired: true });
    setRetired(true);
  };
  return html`<div class=${`feedback ${ok ? 'good' : 'bad'}`}>
    <div class="verdict">${ok ? '✓ 正確 Correct' : answer.partial ? '△ 部分正確 Partly right' : '✗ 再想想 Not quite'}</div>
    ${mode === 'typed' && !answer.correct
      ? html`<div class="corr">
          <div>${d.zhOk ? '✓' : '✗'} <b lang="zh-Hant">${term.zh}</b>${alt(term.zhAlt)}</div>
          <div>${d.enOk ? '✓' : '✗'} <b>${term.en}</b>${alt(term.enAlt)}</div>
        </div>`
      : null}
    ${mode === 'produce' && !answer.correct ? html`<div class="corr"><b class="skt">${term.skt}</b></div>` : null}
    <div class="mini">
      <span class="skt">${term.skt}</span> · <span lang="zh-Hant">${term.zh}</span> · <span>${term.en}</span>
      <div class="small"><${Bi} zh=${term.short_zh} en=${term.short_en} block /></div>
    </div>
    <div class="fb-actions">
      <button class="btn ghost small" onClick=${onDetails}><${L} zh="詳情" en="Details" /></button>
      ${onOverride && !override ? html`<button class="btn ghost small" onClick=${onOverride}><${L} zh="我答對了" en="I was right" /></button>` : null}
      ${ok && !retired ? html`<button class="btn ghost small" onClick=${retire} title="Retire this word"><${L} zh="已掌握，退休" en="Retire" /></button>` : null}
      ${retired ? html`<span class="small muted">已退休 · retired</span>` : null}
    </div>
    <button class="btn primary wide" onClick=${onNext}><${L} zh="下一題" en="Next" /></button>
  </div>`;
}

// ---------------- Comparison questions ----------------

function CompareQuestion({ cmp, qIndex, onRecord, onNext, onDetails }) {
  const key = 'c:' + cmp.id;
  const prog = store.progress(key);
  const q = useMemo(() => {
    if (qIndex === undefined) return makeCompareQuestion(cmp, prog);
    const forced = makeCompareQuestion({ ...cmp, questions: [cmp.questions[qIndex]] }, null);
    return { ...forced, qIndex };
  }, [cmp.id, qIndex]);
  const [answer, setAnswer] = useState(null);
  useEffect(() => {
    if (!q || answer) return;
    const k = (e) => {
      if (q.mode === 'cmp-mcq') {
        const n = +e.key;
        if (n >= 1 && n <= q.options.length) choose(n - 1);
      } else if (e.key === 't' || e.key === 'y') choose(true);
      else if (e.key === 'f' || e.key === 'n') choose(false);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [answer]);
  if (!q) {
    setTimeout(onNext, 0);
    return null;
  }

  const choose = async (v) => {
    if (answer) return;
    const correct = q.mode === 'cmp-mcq' ? v === q.answer : v === q.q.answer;
    setAnswer({ v, correct });
    const { progress } = applyCompareAnswer(prog, correct, q.qIndex);
    await store.setProgress(key, progress);
    await store.addReview({ item: key, correct, mode: q.mode });
    onRecord({ key: key + ':' + q.qIndex, correct, again: { kind: 'compare', id: cmp.id } });
  };

  const optCls = (i) => (!answer ? 'opt' : i === q.answer ? 'opt right' : i === answer.v ? 'opt wrong' : 'opt dim');
  const tfCls = (v) => (!answer ? 'opt' : v === q.q.answer ? 'opt right' : v === answer.v ? 'opt wrong' : 'opt dim');
  return html`<div class="card question">
    <div class="eyebrow"><${L} zh="辨析" en="Compare" /> · <${Bi} zh=${cmp.title_zh} en=${cmp.title_en} /></div>
    <div class="cmp-q"><${Bi} zh=${q.q.q_zh} en=${q.q.q_en} block /></div>
    ${q.mode === 'cmp-mcq'
      ? html`<div class="opts">${q.options.map((o, i) => html`<button class=${optCls(i)} disabled=${!!answer} onClick=${() => choose(i)}>
          <span class="key">${i + 1}</span><${Bi} zh=${o.zh} en=${o.en} block />
        </button>`)}</div>`
      : html`<div class="opts tf">
          <button class=${tfCls(true)} disabled=${!!answer} onClick=${() => choose(true)}><${L} zh="對" en="True" /></button>
          <button class=${tfCls(false)} disabled=${!!answer} onClick=${() => choose(false)}><${L} zh="錯" en="False" /></button>
        </div>`}
    ${answer
      ? html`<${CmpFeedback} ok=${answer.correct} q=${q.q} onNext=${onNext} onDetails=${onDetails} />`
      : null}
  </div>`;
}

function CmpFeedback({ ok, q, onNext, onDetails }) {
  useEnter(onNext, 150);
  return html`<div class=${`feedback ${ok ? 'good' : 'bad'}`}>
    <div class="verdict">${ok ? '✓ 正確 Correct' : '✗ 再想想 Not quite'}</div>
    <div class="explain"><${Bi} zh=${q.explain_zh} en=${q.explain_en} block /></div>
    <div class="fb-actions"><button class="btn ghost small" onClick=${onDetails}><${L} zh="查看比較" en="View comparison" /></button></div>
    <button class="btn primary wide" onClick=${onNext}><${L} zh="下一題" en="Next" /></button>
  </div>`;
}

// ---------------- Summary ----------------

function Summary({ results, params }) {
  const s = store.settings();
  const counts = dailyCounts(store.getReviews());
  const today = counts.get(dayKey())?.n || 0;
  const st = streak(counts);
  const pct = results.n ? Math.round((results.ok / results.n) * 100) : 0;
  const again = params.cmp ? `#/session?cmp=${params.cmp}&r=${Date.now()}` : `#/session?size=${params.size || s.sessionSize}&r=${Date.now()}`;
  return html`<div class="page summary">
    <div class="card">
      <div class="big-emoji">${today >= s.dailyGoal ? '🪷' : '🌱'}</div>
      <h2><${L} zh="本輪完成" en="Round complete" /></h2>
      <div class="tiles">
        <div class="tile"><b>${results.n}</b><span>題 answers</span></div>
        <div class="tile"><b>${pct}%</b><span>正確 correct</span></div>
        <div class="tile"><b>${st.days}</b><span>天連續 day streak</span></div>
      </div>
      <p class="goal-line">今日 ${today} / ${s.dailyGoal} ${today >= s.dailyGoal ? '— 今日目標達成！Daily goal reached!' : `· 再 ${s.dailyGoal - today} 題達成目標 · ${s.dailyGoal - today} to go`}</p>
      ${results.newTerms ? html`<p>🆕 新學 ${results.newTerms} 個詞 · ${results.newTerms} new terms</p>` : null}
      ${results.promoted.length
        ? html`<div class="promoted"><b>⬆ 升級 Level up</b>${results.promoted.map((p) => html`<div class="small">${p}</div>`)}</div>`
        : null}
      <a class="btn primary wide" href=${again}><${L} zh="再來一輪" en="Another round" /></a>
      <a class="btn ghost wide" href="#/"><${L} zh="回首頁" en="Home" /></a>
    </div>
  </div>`;
}

// Enter key triggers the main action (ignored while typing in an input so IME composition works).
function useEnter(fn, delay = 0) {
  useEffect(() => {
    const armed = { v: delay === 0 };
    const t = delay ? setTimeout(() => (armed.v = true), delay) : null;
    const k = (e) => {
      if (e.key !== 'Enter' || !armed.v || e.isComposing) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON') return;
      e.preventDefault();
      fn();
    };
    window.addEventListener('keydown', k);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', k);
    };
  }, [fn]);
}
