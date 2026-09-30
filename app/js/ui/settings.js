// Settings: sync account, learning parameters, display, backup.
import { html, useState, useEffect } from '../../vendor/preact.js';
import * as store from '../store.js';
import * as sync from '../sync.js';
import { get as getContent } from '../content.js';
import { L } from './common.js';
import { REPO_URL } from '../config.js';

function SyncBox() {
  const [st, setSt] = useState(sync.getState());
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState('email');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => sync.subscribe(setSt), []);

  if (!sync.enabled) {
    return html`<p class="small">同步尚未設定：目前資料只存在這台裝置。<br/>Sync is not configured yet — data is stored on this device only.</p>`;
  }
  const run = async (fn) => {
    setBusy(true);
    setErr(null);
    try { await fn(); } catch (e) { setErr(e.message || String(e)); }
    setBusy(false);
  };
  if (st.status === 'signed-out') {
    return step === 'email'
      ? html`<form onSubmit=${(e) => { e.preventDefault(); run(async () => { await sync.sendCode(email.trim()); setStep('code'); }); }}>
          <p class="small">用電子郵件登入，在所有裝置同步進度。· Sign in with email to sync across devices.</p>
          <label class="field"><span>Email</span><input type="email" required value=${email} onInput=${(e) => setEmail(e.target.value)} autocomplete="email" /></label>
          <button class="btn primary wide" disabled=${busy}><${L} zh="寄送驗證碼" en="Send code" /></button>
          ${err ? html`<p class="warn">${err}</p>` : null}
        </form>`
      : html`<form onSubmit=${(e) => { e.preventDefault(); run(() => sync.verifyCode(email.trim(), code)); }}>
          <p class="small">已寄出 6 位數驗證碼到 ${email}。· Enter the 6-digit code sent to ${email}.</p>
          <label class="field"><span>驗證碼 Code</span><input inputmode="numeric" autocomplete="one-time-code" value=${code} onInput=${(e) => setCode(e.target.value)} /></label>
          <button class="btn primary wide" disabled=${busy}><${L} zh="登入" en="Sign in" /></button>
          <button type="button" class="btn ghost wide" onClick=${() => setStep('email')}><${L} zh="重新輸入 Email" en="Change email" /></button>
          ${err ? html`<p class="warn">${err}</p>` : null}
        </form>`;
  }
  const label = { idle: '已同步 Synced', syncing: '同步中… Syncing…', error: '同步失敗 Sync error', offline: '離線 Offline' }[st.status] || st.status;
  return html`<div>
    <p><b>${st.email}</b></p>
    <p class="small">${label}${st.lastSync ? ` · ${new Date(st.lastSync).toLocaleString()}` : ''}</p>
    ${st.error ? html`<p class="warn small">${st.error}</p>` : null}
    <div class="row">
      <button class="btn ghost" onClick=${() => sync.syncNow()}><${L} zh="立即同步" en="Sync now" /></button>
      <button class="btn ghost" onClick=${() => sync.signOut()}><${L} zh="登出" en="Sign out" /></button>
    </div>
  </div>`;
}

function NumField({ k, zh, en, min, max }) {
  const s = store.settings();
  return html`<label class="field inline">
    <span>${zh} <small>${en}</small></span>
    <input type="number" min=${min} max=${max} value=${s[k]} onChange=${(e) => {
      const v = Math.max(min, Math.min(max, parseInt(e.target.value, 10) || min));
      store.saveSettings({ [k]: v });
    }} />
  </label>`;
}

export function Settings() {
  const s = store.settings();
  const content = getContent();
  const [msg, setMsg] = useState(null);

  const exportData = () => {
    const blob = new Blob([JSON.stringify(store.exportAll())], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sanskrit-terms-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importData = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await store.importAll(JSON.parse(await file.text()));
      setMsg('已匯入 Imported');
    } catch (err) {
      setMsg('匯入失敗 Import failed: ' + err.message);
    }
  };

  return html`<div class="page settings">
    <section class="card"><h2><${L} zh="同步" en="Sync" /></h2><${SyncBox} /></section>

    <section class="card">
      <h2><${L} zh="學習" en="Learning" /></h2>
      <${NumField} k="dailyGoal" zh="每日目標（題）" en="Daily goal (answers)" min=${5} max=${300} />
      <${NumField} k="newPerDay" zh="每日新詞" en="New words per day" min=${0} max=${50} />
      <${NumField} k="sessionSize" zh="每輪題數" en="Cards per session" min=${3} max=${100} />
      <${NumField} k="mcqThreshold" zh="選擇題答對幾次後改為打字" en="Correct choices before typing" min=${1} max=${20} />
      <${NumField} k="mcqMinDays" zh="…且至少分散在幾天" en="…spread over at least N days" min=${1} max=${7} />
      <label class="toggle"><input type="checkbox" checked=${s.produceStage} onChange=${(e) => store.saveSettings({ produceStage: e.target.checked })} />
        <${L} zh="熟練後加考「中→梵」拼寫" en="Also ask Chinese → Sanskrit once fluent" /></label>
    </section>

    <section class="card">
      <h2><${L} zh="顯示" en="Display" /></h2>
      <div class="segs">
        ${[['both', '中＋EN'], ['zh', '中文'], ['en', 'English']].map(([v, label]) => html`<button class=${`seg ${s.lang === v ? 'on' : ''}`} onClick=${() => store.saveSettings({ lang: v })}>${label}</button>`)}
      </div>
      <p class="small muted">解說與經文翻譯的語言 · Language for explanations and translations</p>
    </section>

    <section class="card">
      <h2><${L} zh="資料" en="Data" /></h2>
      <div class="row">
        <button class="btn ghost" onClick=${exportData}><${L} zh="匯出備份" en="Export backup" /></button>
        <label class="btn ghost file-btn"><${L} zh="匯入備份" en="Import backup" /><input type="file" accept="application/json" onChange=${importData} /></label>
      </div>
      <button class="btn ghost danger" onClick=${async () => {
        if (confirm('確定清除所有學習進度？（自訂詞彙與作答紀錄會保留）\nReset all learning progress? (custom words and history are kept)')) {
          await store.resetProgress();
          setMsg('進度已重設 Progress reset');
        }
      }}><${L} zh="重設學習進度" en="Reset progress" /></button>
      ${msg ? html`<p class="ok-msg">${msg}</p>` : null}
    </section>

    <section class="card small">
      <h2><${L} zh="關於" en="About" /></h2>
      <p>詞庫版本 content ${content.version} · ${content.terms.size} 詞 terms · ${content.comparisons.length} 比較 comparisons</p>
      <p>經文引自 CBETA 電子佛典，並逐字核對。· Scripture quotations from CBETA, verified line by line.</p>
      <p><a href=${REPO_URL} target="_blank" rel="noopener">GitHub</a> · <a href=${REPO_URL + '/issues'} target="_blank" rel="noopener">回報問題 Report an issue</a></p>
    </section>
  </div>`;
}
