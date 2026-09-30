// Add words: one at a time, in bulk (paste), or by asking Claude to compile a list.
import { html, useState } from '../../vendor/preact.js';
import * as store from '../store.js';
import { get as getContent } from '../content.js';
import { normSkt, normZh } from '../grade.js';
import { L } from './common.js';

const splitAlts = (s, re = /[\/、;；]/) => String(s || '').split(re).map((x) => x.trim()).filter(Boolean);
const newKey = (skt) => `u-${normSkt(skt).slice(0, 24) || 'term'}-${Math.random().toString(36).slice(2, 6)}`;

function findDuplicate(content, skt, zh, ignoreId) {
  const s = normSkt(skt);
  const z = normZh(zh, content.s2t);
  for (const t of content.terms.values()) {
    if (t.id === ignoreId) continue;
    if ((s && normSkt(t.skt) === s) || (z && normZh(t.zh, content.s2t) === z)) return t;
  }
  return null;
}

export function Add({ params }) {
  const [tab, setTab] = useState(params.edit ? 'single' : params.tab || 'single');
  const tabBtn = (id, zh, en) => html`<button class=${`seg ${tab === id ? 'on' : ''}`} onClick=${() => setTab(id)}><${L} zh=${zh} en=${en} /></button>`;
  return html`<div class="page add">
    <div class="segs wide">${tabBtn('single', '單筆', 'One')}${tabBtn('bulk', '批次', 'Bulk')}${tabBtn('claude', '請 Claude', 'Ask Claude')}</div>
    ${tab === 'single' ? html`<${Single} editId=${params.edit} />` : tab === 'bulk' ? html`<${Bulk} />` : html`<${AskClaude} />`}
  </div>`;
}

function Single({ editId }) {
  const content = getContent();
  const existing = editId ? store.getDoc('custom', editId) : null;
  const empty = { skt: '', zh: '', zhAlt: '', en: '', enAlt: '', short_zh: '', short_en: '', tags: '', note: '' };
  const [f, setF] = useState(
    existing
      ? { ...empty, ...existing, zhAlt: (existing.zhAlt || []).join('、'), enAlt: (existing.enAlt || []).join('; '), tags: (existing.tags || []).join('、') }
      : empty,
  );
  const [msg, setMsg] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const dup = f.skt || f.zh ? findDuplicate(content, f.skt, f.zh, editId) : null;

  const save = async (e) => {
    e.preventDefault();
    if (!f.skt.trim() || !f.zh.trim() || !f.en.trim()) return setMsg('梵語、中文、英文為必填 · Sanskrit, Chinese and English are required');
    const data = {
      skt: f.skt.trim(),
      zh: f.zh.trim(),
      zhAlt: splitAlts(f.zhAlt),
      en: f.en.trim(),
      enAlt: splitAlts(f.enAlt, /[;；\/]/),
      short_zh: f.short_zh.trim(),
      short_en: f.short_en.trim(),
      tags: splitAlts(f.tags, /[,，、;；]/),
      note: f.note.trim(),
      addedAt: existing?.addedAt || Date.now(),
    };
    await store.saveDoc('custom', editId || newKey(data.skt), data);
    if (editId) location.hash = '#/term/' + encodeURIComponent(editId);
    else {
      setMsg(`已加入 Added: ${data.skt} ${data.zh}`);
      setF(empty);
    }
  };
  const remove = async () => {
    if (!confirm('刪除這個詞？Delete this word?')) return;
    await store.deleteDoc('custom', editId);
    location.hash = '#/browse';
  };

  const field = (k, zh, en, props = {}) => html`<label class="field">
    <span>${zh} <small>${en}</small></span>
    <input value=${f[k]} onInput=${set(k)} autocomplete="off" autocapitalize="off" spellcheck="false" ...${props} />
  </label>`;
  return html`<form class="card" onSubmit=${save}>
    <h2>${editId ? html`<${L} zh="編輯詞彙" en="Edit word" />` : html`<${L} zh="新增一個詞" en="Add a word" />`}</h2>
    ${field('skt', '梵語 *', 'Sanskrit (IAST)', { placeholder: 'e.g. prajñā' })}
    ${field('zh', '中文 *', 'Chinese', { placeholder: '例：般若', lang: 'zh-Hant' })}
    ${field('en', '英文 *', 'English', { placeholder: 'e.g. wisdom' })}
    ${field('zhAlt', '其他中譯', 'Other Chinese (、separated)', { placeholder: '慧、智慧', lang: 'zh-Hant' })}
    ${field('enAlt', '其他英譯', 'Other English (; separated)', { placeholder: 'insight; discernment' })}
    ${field('short_zh', '簡短解釋（中）', 'Short definition (zh)', { lang: 'zh-Hant' })}
    ${field('short_en', '簡短解釋（英）', 'Short definition (en)')}
    ${field('tags', '標籤／詞表', 'Tags / list names (、separated)', { placeholder: '六度' })}
    <label class="field"><span>筆記 <small>Note</small></span><textarea rows="2" value=${f.note} onInput=${set('note')}></textarea></label>
    ${dup ? html`<p class="warn">⚠︎ 已有相似的詞 · Similar word exists: <a href=${'#/term/' + dup.id}>${dup.skt} ${dup.zh}</a></p>` : null}
    ${msg ? html`<p class="ok-msg">${msg}</p>` : null}
    <button class="btn primary wide" type="submit">${editId ? html`<${L} zh="儲存" en="Save" />` : html`<${L} zh="加入" en="Add" />`}</button>
    ${editId ? html`<button type="button" class="btn ghost wide danger" onClick=${remove}><${L} zh="刪除" en="Delete" /></button>` : null}
  </form>`;
}

export function parseBulk(text) {
  const src = text.trim();
  if (!src) return [];
  if (src.startsWith('[')) {
    const arr = JSON.parse(src);
    return arr.map((o) => ({
      skt: o.skt || o.sanskrit || '',
      zh: o.zh || o.chinese || '',
      zhAlt: o.zhAlt || [],
      en: o.en || o.english || '',
      enAlt: o.enAlt || [],
      short_zh: o.short_zh || '',
      short_en: o.short_en || o.definition || '',
      tags: o.tags || [],
    }));
  }
  const lines = src.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'));
  const sep = lines.some((l) => l.includes('\t')) ? '\t' : lines.some((l) => l.includes('|')) ? '|' : ',';
  const rows = lines.map((l) => l.split(sep).map((c) => c.trim()));
  if (rows.length && /^(sanskrit|skt|梵|梵語|梵文)$/i.test(rows[0][0])) rows.shift();
  return rows.map(([skt = '', zh = '', en = '', def = '', tags = '']) => {
    const zhs = splitAlts(zh);
    const ens = splitAlts(en, /[\/;；]/);
    const hasCjk = /[㐀-鿿]/.test(def);
    return {
      skt, zh: zhs[0] || '', zhAlt: zhs.slice(1), en: ens[0] || '', enAlt: ens.slice(1),
      short_zh: hasCjk ? def : '', short_en: hasCjk ? '' : def,
      tags: splitAlts(tags, /[,，、;；]/),
    };
  });
}

function Bulk() {
  const content = getContent();
  const [text, setText] = useState('');
  const [tag, setTag] = useState('');
  const [msg, setMsg] = useState(null);
  let rows = [];
  let error = null;
  try {
    rows = parseBulk(text);
  } catch (e) {
    error = 'JSON 格式錯誤 · invalid JSON: ' + e.message;
  }
  const seen = new Set();
  const checked = rows.map((r) => {
    let status = 'new';
    if (!r.skt || !r.zh || !r.en) status = 'invalid';
    else if (findDuplicate(content, r.skt, r.zh) || seen.has(normSkt(r.skt))) status = 'dup';
    seen.add(normSkt(r.skt));
    return { ...r, status };
  });
  const good = checked.filter((r) => r.status === 'new');

  const doImport = async () => {
    const extraTags = splitAlts(tag, /[,，、;；]/);
    const now = Date.now();
    await store.saveDocsBulk(good.map(({ status, ...r }) => ({
      kind: 'custom', key: newKey(r.skt), data: { ...r, tags: [...new Set([...(r.tags || []), ...extraTags])], addedAt: now },
    })));
    setMsg(`已加入 ${good.length} 個詞 · Added ${good.length} words`);
    setText('');
  };

  return html`<div class="card">
    <h2><${L} zh="批次新增" en="Add many words" /></h2>
    <p class="small">每行一個詞，欄位用 Tab、| 或逗號分隔。可直接從試算表貼上。<br/>One word per line; columns separated by tab, | or comma (paste from a spreadsheet works).</p>
    <pre class="fmt">梵語 | 中文 | English | 解釋 (可選) | 標籤 (可選)
prajñā | 般若/慧 | wisdom/insight | 如實了知諸法 | 六度
dāna | 布施 | giving/generosity | | 六度</pre>
    <p class="small muted">多個譯名用 / 分隔，第一個為主。也可貼 JSON 陣列。· Separate alternatives with /; the first is the main one. A JSON array also works.</p>
    <textarea class="bulk" rows="8" value=${text} onInput=${(e) => setText(e.target.value)} placeholder="prajñā | 般若 | wisdom"></textarea>
    <label class="field"><span>為這批詞加標籤 <small>Tag for this batch (optional)</small></span><input value=${tag} onInput=${(e) => setTag(e.target.value)} placeholder="例：六度" /></label>
    ${error ? html`<p class="warn">${error}</p>` : null}
    ${checked.length
      ? html`<div class="table-wrap"><table class="preview">
          <thead><tr><th></th><th>梵語</th><th>中文</th><th>English</th></tr></thead>
          <tbody>${checked.map((r) => html`<tr class=${r.status}>
            <td>${r.status === 'new' ? '✓' : r.status === 'dup' ? '重複' : '缺欄'}</td>
            <td class="skt">${r.skt}</td><td lang="zh-Hant">${[r.zh, ...r.zhAlt].join('/')}</td><td>${[r.en, ...r.enAlt].join('/')}</td>
          </tr>`)}</tbody>
        </table></div>
        <p class="small">${good.length} 個可加入 · ${checked.length - good.length} 個略過（重複或缺欄） · ${good.length} to add, ${checked.length - good.length} skipped</p>`
      : null}
    ${msg ? html`<p class="ok-msg">${msg}</p>` : null}
    <button class="btn primary wide" disabled=${!good.length} onClick=${doImport}><${L} zh=${`加入 ${good.length} 個詞`} en="Import" /></button>
  </div>`;
}

function AskClaude() {
  const example = '請在 sanskrit-buddhist-terms 加入「十二因緣」全部十二支：每個詞要有梵語、中英譯、深入解說（中英）、與易混淆詞的比較，以及 CBETA 經證。';
  const [copied, setCopied] = useState(false);
  return html`<div class="card">
    <h2><${L} zh="請 Claude 編纂" en="Ask Claude to compile" /></h2>
    <p>在 Claude Code 裡告訴 Claude 你想加入哪些詞或哪一組詞表。Claude 會撰寫完整條目（含深入解說、學派比較、經過 CBETA 逐字核對的引文），推送到 GitHub，約一分鐘後自動出現在所有裝置上，成為新的詞表。</p>
    <p class="small">In Claude Code, tell Claude which terms or lists to add. Claude writes full entries (in-depth notes, school comparisons, CBETA-verified quotes), pushes to GitHub, and about a minute later they appear on all your devices as a new list.</p>
    <div class="eyebrow">範例 Example</div>
    <blockquote class="example" lang="zh-Hant">${example}</blockquote>
    <button class="btn ghost" onClick=${() => navigator.clipboard?.writeText(example).then(() => setCopied(true))}>${copied ? '已複製 Copied' : '複製 Copy'}</button>
    <p class="small muted">你自己在這裡新增的詞只屬於你的帳號（私人）；Claude 加入的詞會成為公開內容的一部分。<br/>Words you add here stay private to your account; words Claude adds become part of the shared content.</p>
  </div>`;
}
