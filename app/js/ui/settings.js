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
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('signin');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => sync.subscribe(setSt), []);

  if (!sync.enabled) {
    return html`<p class="small">同步尚未設定：目前資料只存在這台裝置。<br/>Sync is not configured yet — data is stored on this device only.</p>`;
  }
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      if (mode === 'signup') await sync.signUp(email.trim(), password);
      else await sync.signIn(email.trim(), password);
    } catch (e2) {
      const m = e2.message || String(e2);
      setErr(/invalid login/i.test(m) ? 'Email 或密碼錯誤 · Wrong email or password' : m);
    }
    setBusy(false);
  };
  if (st.status === 'signed-out') {
    return html`<form onSubmit=${submit}>
      <div class="segs wide">
        <button type="button" class=${`seg ${mode === 'signin' ? 'on' : ''}`} onClick=${() => setMode('signin')}><${L} zh="登入" en="Sign in" /></button>
        <button type="button" class=${`seg ${mode === 'signup' ? 'on' : ''}`} onClick=${() => setMode('signup')}><${L} zh="建立帳號" en="Create account" /></button>
      </div>
      <p class="small">${mode === 'signup'
        ? '在第一台裝置建立帳號，之後在其他裝置用同一組 Email 和密碼登入。· Create the account once, then sign in with the same email and password on your other devices.'
        : '用同一組帳號在所有裝置同步進度 · Sign in with the same account on every device to sync.'}</p>
      <label class="field"><span>Email</span><input type="email" required value=${email} onInput=${(e) => setEmail(e.target.value)} autocomplete="username" autocapitalize="off" /></label>
      <label class="field"><span>密碼 Password${mode === 'signup' ? '（至少 6 個字元 · min. 6 characters）' : ''}</span>
        <input type="password" required minlength="6" value=${password} onInput=${(e) => setPassword(e.target.value)}
          autocomplete=${mode === 'signup' ? 'new-password' : 'current-password'} /></label>
      <button class="btn primary wide" disabled=${busy}>${mode === 'signup' ? html`<${L} zh="建立帳號並同步" en="Create account & sync" />` : html`<${L} zh="登入並同步" en="Sign in & sync" />`}</button>
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

function UpdateButton() {
  const [state, setState] = useState(null);
  const run = async () => {
    setState('checking');
    try {
      setState((await window.__checkForUpdate?.()) || 'unsupported');
    } catch {
      setState('error');
    }
  };
  const msg = { checking: '檢查中… Checking…', latest: '已是最新版本 · Up to date', updating: '正在更新，即將重新載入… · Updating, reloading…', unsupported: '此瀏覽器不支援 · Not supported here', error: '無法連線 · Offline?' }[state];
  return html`<p><button class="btn ghost small" onClick=${run}><${L} zh="檢查更新" en="Check for updates" /></button> ${msg ? html`<span class="small muted">${msg}</span>` : null}</p>`;
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
      <h2><${L} zh="梵語發音" en="Pronunciation" /></h2>
      <p class="small">自動播放 · Play automatically</p>
      <div class="segs">
        ${[['off', '關 Off'], ['intro', '新詞 New words'], ['all', '新詞＋作答後 + answers']].map(([v, label]) => html`<button class=${`seg ${s.autoplay === v ? 'on' : ''}`} onClick=${() => store.saveSettings({ autoplay: v })}>${label}</button>`)}
      </div>
      <p class="small">速度 · Speed</p>
      <div class="segs">
        ${[['normal', '正常 Normal'], ['slow', '慢速 Slow']].map(([v, label]) => html`<button class=${`seg ${s.audioSpeed === v ? 'on' : ''}`} onClick=${() => store.saveSettings({ audioSpeed: v })}>${label}</button>`)}
      </div>
      <p class="small muted">內建詞彙由 Indic Parler-TTS 梵語語音合成；自行新增的詞使用裝置語音（≈，僅供參考）。· Built-in terms use a Sanskrit neural voice (Indic Parler-TTS); words you add use the device voice (≈, approximate).</p>
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
      <${UpdateButton} />
      <p>詞庫版本 content ${content.version} · ${content.terms.size} 詞 terms · ${content.comparisons.length} 比較 comparisons</p>
      <p>經文引自 CBETA 電子佛典，並逐字核對。· Scripture quotations from CBETA, verified line by line.</p>
      <p><a href=${REPO_URL} target="_blank" rel="noopener">GitHub</a> · <a href=${REPO_URL + '/issues'} target="_blank" rel="noopener">回報問題 Report an issue</a></p>
    </section>
  </div>`;
}
