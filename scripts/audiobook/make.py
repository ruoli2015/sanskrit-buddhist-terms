"""Build an audiobook from a script: <book-dir>/script.yaml → <book-dir>/out/<id>.mp3 + manifest.json.

  env/bin/python make.py <book-dir> skt      Sanskrit clips (Indic Parler-TTS, Whisper-checked)
  K=10 env/bin/python make.py <book-dir> skt hi saḥ   redo these clips with 10 takes each
  env/bin/python make.py <book-dir> tts      English/Chinese clips (Azure; needs AZURE_SPEECH_KEY/REGION)
  env/bin/python make.py <book-dir> build    assemble the MP3 and the timing manifest
  env/bin/python make.py <book-dir> all
  env/bin/python make.py <book-dir> voices   check that the Azure voice exists in your region

Clips are cached by content under ~/.cache/sbt-tts/books/<id>/, so editing one note only
re-synthesizes that note. Script markup: {iast} = Sanskrit word spoken by the Sanskrit voice;
[shown|spoken] = transcript text | what the English voice says. See private/audiobooks/*/script.yaml.
"""
import hashlib, json, os, re, sys, time
from pathlib import Path
from xml.sax.saxutils import escape

import numpy as np, soundfile as sf, yaml
from scipy.signal import resample_poly

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'audio'))
from iast import to_deva  # noqa: E402
from scorelib import skeleton, score, trim  # noqa: E402

SR = 24000
DEFAULTS = dict(voice='zh-CN-YunyiMultilingualNeural', rate='-5%', zh_script='traditional', inline='splice',
                takes_word=3, takes_line=4, kbps=48, spell=True)
PAUSE = dict(intro=1.5, section=1.5, heading=0.6, verse=1.6, word=1.2, grammar=1.4, translation=1.2,
             xuanzang=1.4, repeat=2.5)

SKT_RE = re.compile(r'\{([^{}]+)\}')
ALT_RE = re.compile(r'\[([^|\]]*)\|([^\]]*)\]')
CJK_RE = re.compile(r'([　-〿㐀-鿿＀-￯…（）「」『』]+)')


def h(s):
    return hashlib.sha1(s.encode()).hexdigest()[:16]


def shown(text):
    """Transcript text: {x} → x, [a|b] → a."""
    return ALT_RE.sub(r'\1', SKT_RE.sub(r'\1', ' '.join(text.split())))


# ---------- script → timeline ----------
def timeline(book, cfg=None):
    """List of segments; each has kind, metadata for the manifest, and clips to play in order.
    Clip: ('skt', iast) | ('en', markup) | ('zh', text) | ('pause', seconds)."""
    cfg = cfg or DEFAULTS
    segs = []
    add = lambda kind, clips, **meta: segs.append(dict(kind=kind, clips=clips, **meta))
    if book.get('intro'):
        clips = [('en', book['intro'])] + ([('pause', 0.4), ('zh', book['intro_zh'])] if book.get('intro_zh') else [])
        add('intro', clips, text=shown(book['intro']))
    for si, sec in enumerate(book['sections'], 1):
        add('section', [('en', f"Part {si}: {sec['title_en']}."), ('pause', 0.4), ('zh', sec['title_zh'])],
            section=sec['id'], title_zh=sec['title_zh'], title_en=sec['title_en'])
        for v in sec['verses']:
            n = v['n']
            reading = [('skt', v['lines'][0]), ('pause', 0.8), ('skt', v['lines'][1])]
            add('heading', [('en', f'Verse {n}.')], section=sec['id'], verse=n)
            add('verse', reading, section=sec['id'], verse=n, lines=v['lines'])
            for wi, w in enumerate(v['words']):
                spell = [('spell', w['skt']), ('pause', 0.6)] if cfg['spell'] else []
                add('word', spell + [('skt', w['skt']), ('pause', 0.5), ('en', w['en']), ('pause', 0.35), ('zh', w['zh']),
                             ('pause', 0.6), ('en', w['note'])],
                    section=sec['id'], verse=n, word=wi, skt=w['skt'], form=w.get('form', w['skt']),
                    en=shown(w['en']), zh=w['zh'], note=shown(w['note']))
            add('grammar', [('en', 'The verse as a whole.'), ('pause', 0.5), ('en', v['grammar'])],
                section=sec['id'], verse=n, text=shown(v['grammar']))
            add('translation', [('en', 'Translation.'), ('pause', 0.5), ('en', v['translation'])],
                section=sec['id'], verse=n, text=shown(v['translation']))
            if v.get('xuanzang'):
                zh = ''.join(q['text'] for q in v['xuanzang'])
                add('xuanzang', [('en', "Xuanzang's Chinese."), ('pause', 0.5), ('zh', zh)],
                    section=sec['id'], verse=n, text=zh, refs=[{k: q[k] for k in ('ref', 'refEnd') if k in q} for q in v['xuanzang']])
            add('repeat', reading, section=sec['id'], verse=n, lines=v['lines'])
    return segs


def skt_units(segs):
    """Every Sanskrit string to synthesize: verse lines, words, and {inline} words in English text."""
    units = {}
    for s in segs:
        for kind, x in s['clips']:
            if kind == 'skt':
                units[x] = 'line' if s['kind'] in ('verse', 'repeat') else 'word'
            elif kind == 'en':
                for w in SKT_RE.findall(x):
                    units.setdefault(w, 'word')
    return units


# ---------- Sanskrit: Indic Parler-TTS + Whisper ----------
def synth_skt(cache, units, cfg, redo=()):
    os.environ.setdefault('HF_HUB_OFFLINE', '1')
    import torch, whisper
    from parler_tts import ParlerTTSForConditionalGeneration
    from transformers import AutoTokenizer
    out = cache / 'skt'; out.mkdir(parents=True, exist_ok=True)
    todo = {u: k for u, k in units.items() if u in redo or not (out / f'{h(to_deva(u))}.wav').exists()}
    print(f'Sanskrit: {len(units)} clips, {len(todo)} to generate', flush=True)
    if not todo:
        return
    model = ParlerTTSForConditionalGeneration.from_pretrained('ai4bharat/indic-parler-tts').to('cpu')
    tok = AutoTokenizer.from_pretrained('ai4bharat/indic-parler-tts')
    dtok = AutoTokenizer.from_pretrained(model.config.text_encoder._name_or_path)
    d = dtok('Aryan speaks slowly and distinctly with very clear audio, close up, with no background noise.', return_tensors='pt')
    sr = model.config.sampling_rate
    asr = whisper.load_model('turbo')
    report_path = cache / 'skt-report.json'
    report = json.loads(report_path.read_text()) if report_path.exists() else {}
    for i, (u, kind) in enumerate(todo.items(), 1):
        deva = to_deva(u)
        p = tok(deva + ' ।', return_tensors='pt')
        best = None
        for k in range(int(os.environ.get('K', 0)) or (cfg['takes_line'] if kind == 'line' else cfg['takes_word'])):
            for attempt in range(8):
                torch.manual_seed(int(h(deva)[:6], 16) + k * 7919 + attempt * 104729)
                g = model.generate(input_ids=d.input_ids, attention_mask=d.attention_mask,
                                   prompt_input_ids=p.input_ids, prompt_attention_mask=p.attention_mask)
                a = g.cpu().numpy().squeeze()
                if a.ndim == 1 and len(a) > 0.35 * sr:
                    break
            a = trim(a, sr)
            heard = asr.transcribe(resample_poly(a, 16000, sr).astype(np.float32), language='hi', fp16=False,
                                   temperature=0, condition_on_previous_text=False)['text'].strip()
            sim, per, dur_ok = score(deva, heard, len(a) / sr)
            repeat = len(skeleton(heard)) > 1.6 * len(skeleton(deva)) + 1
            final = sim - (0 if dur_ok else 0.3) - (0.3 if repeat else 0)
            if best is None or final > best[0]:
                best = (final, a, heard)
        final, a, heard = best
        sf.write(out / f'{h(deva)}.wav', a, sr)
        report[u] = dict(deva=deva, heard=heard, score=round(final, 2), dur=round(len(a) / sr, 2))
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=1))
        flag = '  ⚑ LOW' if final < 0.6 else ''
        print(f'[{i}/{len(todo)}] {final:.2f} {u} → {heard}{flag}', flush=True)


def load_skt(cache, iast):
    a, sr = sf.read(cache / 'skt' / f'{h(to_deva(iast))}.wav')
    return resample_poly(a, SR, sr).astype(np.float32)


# ---------- English / Chinese: Azure neural TTS ----------
def env():
    for p in (Path.cwd() / '.env', Path(__file__).resolve().parents[2] / '.env'):
        if p.exists():
            for line in p.read_text().splitlines():
                m = re.match(r'\s*([A-Z_]+)\s*=\s*(.*?)\s*$', line)
                if m: os.environ.setdefault(m[1], m[2].strip('"\''))
    return os.environ.get('AZURE_SPEECH_KEY'), os.environ.get('AZURE_SPEECH_REGION', 'eastus')


_t2s = None
def zh_text(s, cfg):
    global _t2s
    if cfg['zh_script'] != 'simplified':
        return s
    if _t2s is None:
        import opencc
        _t2s = opencc.OpenCC('t2s')
    return _t2s.convert(s)


def lang_runs(text, cfg, default='en-US'):
    """Wrap Chinese runs in <lang zh-CN> so the multilingual voice switches language inside a sentence."""
    out = []
    for part in CJK_RE.split(text):
        if not part.strip():
            if part: out.append(escape(part))
            continue
        if CJK_RE.fullmatch(part):
            out.append(f'<lang xml:lang="zh-CN">{escape(zh_text(part, cfg))}</lang>')
        else:
            out.append(f'<lang xml:lang="{default}">{escape(part)}</lang>')
    return ''.join(out)


def en_parts(text):
    """English markup → [str | [iast, ...]]. Sanskrit words separated only by punctuation form one
    group, because their breaks would merge into a single silence."""
    pieces = SKT_RE.split(ALT_RE.sub(r'\2', ' '.join(text.split())))
    out = [pieces[0]]
    for i in range(1, len(pieces), 2):
        if isinstance(out[-1], list):
            out[-1].append(pieces[i])
        elif len(out) > 1 and not re.search(r'\w', out[-1]) and isinstance(out[-2], list):
            out.pop(); out[-1].append(pieces[i])
        else:
            out.append([pieces[i]])
        out.append(pieces[i + 1])
    return out


WORD_GAP = 0.25  # between Sanskrit words of one group


def group_ms(cache, group):
    return int(round((sum(len(load_skt(cache, w)) for w in group) / SR + 0.3 + WORD_GAP * (len(group) - 1)) * 1000))


# Spelling: plain letters are read as letter names; marked letters are described by how they look,
# except the bar over a vowel, which is read as "long".
MARKS = {'ā': 'long {}', 'ī': 'long {}', 'ū': 'long {}', 'ṛ': '{} with a dot below', 'ṝ': 'long {} with a dot below',
         'ḷ': '{} with a dot below', 'ṃ': '{} with a dot below', 'ṁ': '{} with a dot above', 'ḥ': '{} with a dot below',
         'ṅ': '{} with a dot above', 'ñ': '{} with a tilde', 'ṭ': '{} with a dot below', 'ḍ': '{} with a dot below',
         'ṇ': '{} with a dot below', 'ś': '{} with an accent', 'ṣ': '{} with a dot below'}


def spell_ssml(iast):
    """Plain capital letters separated by commas: <say-as interpret-as="characters"> drops the letter a."""
    import unicodedata
    members = []
    for m in unicodedata.normalize('NFC', iast.lower()).split('-'):
        letters = []
        for ch in m:
            if ch in MARKS:
                letters.append(MARKS[ch].format(unicodedata.normalize('NFD', ch)[0].upper()))
            elif ch.isalpha():
                letters.append(ch.upper())
        members.append(', '.join(letters) + '.')
    return '<break time="500ms"/>'.join(members)  # pause between compound members


def ssml(kind, text, cfg, cache=None):
    """SSML for one clip. In English, each {word} (or group of adjacent words) becomes a timed break,
    filled later with the Sanskrit clip; with inline: voice, the multilingual voice reads it in Devanagari."""
    if kind == 'zh':
        body = f'<lang xml:lang="zh-CN">{escape(zh_text(text, cfg))}</lang>'
    elif kind == 'spell':
        body = f'<lang xml:lang="en-US">{spell_ssml(text)}</lang>'
    else:
        body = []
        for p in en_parts(text):
            if isinstance(p, str):
                body.append(lang_runs(p, cfg))
            elif cfg['inline'] == 'voice':
                body.append(f'<lang xml:lang="hi-IN">{escape(" ".join(to_deva(w) for w in p))}</lang>')
            else:
                body.append(f'<break time="{group_ms(cache, p)}ms"/>')
        body = ''.join(body)
    return ('<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" '
            'xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-US">'
            f'<voice name="{cfg["voice"]}"><prosody rate="{cfg["rate"]}">{body}</prosody></voice></speak>')


def tts_jobs(segs, cache, cfg):
    jobs = {}
    for s in segs:
        for kind, x in s['clips']:
            if kind in ('en', 'zh', 'spell'):
                doc = ssml(kind, x, cfg, cache)
                jobs[h(doc)] = doc
    return jobs


def check_voice(cfg):
    import requests
    key, region = env()
    if not key:
        sys.exit('Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in .env (see private/audiobook-plan.md).')
    r = requests.get(f'https://{region}.tts.speech.microsoft.com/cognitiveservices/voices/list',
                     headers={'Ocp-Apim-Subscription-Key': key}, timeout=30)
    r.raise_for_status()
    v = next((x for x in r.json() if x['ShortName'] == cfg['voice']), None)
    if not v:
        sys.exit(f"{cfg['voice']} is not offered in {region}. Multilingual voices: "
                 + ', '.join(x['ShortName'] for x in r.json() if 'Multilingual' in x['ShortName']))
    print(f"✓ {v['ShortName']} in {region}: {v.get('LocalName')} · speaks {', '.join(v.get('SecondaryLocaleList', [])) or v['Locale']}")


def synth_tts(segs, cache, cfg):
    import requests
    key, region = env()
    out = cache / 'tts'; out.mkdir(parents=True, exist_ok=True)
    jobs = tts_jobs(segs, cache, cfg)
    todo = {k: d for k, d in jobs.items() if not (out / f'{k}.wav').exists()}
    chars = sum(len(re.sub(r'<[^>]+>', '', d)) for d in todo.values())
    print(f'Azure: {len(jobs)} clips, {len(todo)} to synthesize, ~{chars} characters', flush=True)
    if not todo:
        return
    if not key:
        sys.exit('Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in .env (see private/audiobook-plan.md).')
    url = f'https://{region}.tts.speech.microsoft.com/cognitiveservices/v1'
    hdr = {'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/ssml+xml',
           'X-Microsoft-OutputFormat': 'riff-24khz-16bit-mono-pcm', 'User-Agent': 'sbt-audiobook'}
    for i, (k, doc) in enumerate(todo.items(), 1):
        for wait in (0, 10, 20, 40, 60, 90):  # the free tier allows ~20 requests a minute
            time.sleep(wait or 3)
            r = requests.post(url, headers=hdr, data=doc.encode('utf-8'), timeout=60)
            if r.status_code != 429:
                break
        if r.status_code != 200:
            sys.exit(f'Azure error {r.status_code}: {r.text[:300]}\n{doc[:300]}')
        (out / f'{k}.wav').write_bytes(r.content)
        print(f'[{i}/{len(todo)}] {re.sub(r"<[^>]+>", "", doc)[:70]}', flush=True)


# ---------- assembly ----------
def level(a, target_db=-20.0, peak=0.89):
    """Match speech loudness across voices: RMS of the voiced frames → target, without clipping."""
    f = int(SR * 0.02)
    m = len(a) // f
    if m == 0:
        return a
    e = np.sqrt((a[:m * f].reshape(m, f) ** 2).mean(1))
    voiced = e[e > e.max() * 10 ** (-30 / 20)]
    g = 10 ** (target_db / 20) / (np.sqrt((voiced ** 2).mean()) + 1e-9)
    g = min(g, peak / (np.abs(a).max() + 1e-9))
    return (a * g).astype(np.float32)


def silences(a, min_len):
    """Silent runs (start, end) in samples, longest first."""
    f = int(SR * 0.01)
    m = len(a) // f
    e = np.sqrt((a[:m * f].reshape(m, f) ** 2).mean(1) + 1e-12)
    sil = e < max(e.max() * 10 ** (-40 / 20), 10 ** (-60 / 20))
    runs, i = [], 0
    while i < m:
        if sil[i]:
            j = i
            while j < m and sil[j]: j += 1
            if (j - i) * f >= min_len: runs.append((i * f, j * f))  # edges too: a {word} can open or close a clip
            i = j
        else:
            i += 1
    return sorted(runs, key=lambda r: r[0] - r[1])


def render_en(cache, cfg, text):
    a = level(sf.read(cache / 'tts' / f'{h(ssml("en", text, cfg, cache))}.wav', dtype='float32')[0])
    groups = [p for p in en_parts(text) if isinstance(p, list)]
    if not groups or cfg['inline'] == 'voice':
        return a
    expect = [group_ms(cache, g) / 1000 for g in groups]
    gaps = sorted(silences(a, int(0.5 * min(expect) * SR))[:len(groups)])
    if len(gaps) < len(groups) or any(e - s < 0.6 * L * SR for (s, e), L in zip(gaps, expect)):
        raise RuntimeError(f'could not place {len(groups)} Sanskrit word(s) in: {text[:80]}')
    out, pos, pad = [], 0, np.zeros(int(0.1 * SR), np.float32)
    between = np.zeros(int(WORD_GAP * SR), np.float32)
    for (s, e), g in zip(gaps, groups):
        clip = [x for i, w in enumerate(g) for x in ([between] if i else []) + [level(load_skt(cache, w))]]
        out += [a[pos:s], pad, *clip, pad]
        pos = e
    out.append(a[pos:])
    return np.concatenate(out)


def render(cache, cfg, clip):
    kind, x = clip
    if kind == 'pause':
        return np.zeros(int(x * SR), np.float32)
    if kind == 'skt':
        return level(load_skt(cache, x))
    if kind in ('zh', 'spell'):
        return level(sf.read(cache / 'tts' / f'{h(ssml(kind, x, cfg, cache))}.wav', dtype='float32')[0])
    return render_en(cache, cfg, x)


def write_mp3(a, path, kbps):
    import lameenc
    enc = lameenc.Encoder()
    enc.set_bit_rate(kbps); enc.set_in_sample_rate(SR); enc.set_channels(1); enc.set_quality(2)
    pcm = (np.clip(a, -1, 1) * 32767).astype('<i2').tobytes()
    path.write_bytes(enc.encode(pcm) + enc.flush())


def build(book, segs, cache, cfg, outdir):
    outdir.mkdir(parents=True, exist_ok=True)
    pieces, t, manifest_segs = [], 0.0, []
    for i, s in enumerate(segs):
        audio = np.concatenate([render(cache, cfg, c) for c in s['clips']])
        meta = {k: v for k, v in s.items() if k != 'clips'}
        meta.update(i=i, start=round(t, 2), end=round(t + len(audio) / SR, 2))
        manifest_segs.append(meta)
        gap = PAUSE[s['kind']] if not (s['kind'] == 'word' and i + 1 < len(segs) and segs[i + 1]['kind'] != 'word') else 1.6
        pieces += [audio, np.zeros(int(gap * SR), np.float32)]
        t += (len(audio) + int(gap * SR)) / SR
    a = np.concatenate(pieces)
    mp3 = outdir / f"{book['id']}.mp3"
    write_mp3(a, mp3, cfg['kbps'])
    manifest = dict(id=book['id'], title_zh=book['title_zh'], title_en=book['title_en'], title_skt=book.get('title_skt'),
                    audio=mp3.name, duration=round(len(a) / SR, 2), bytes=mp3.stat().st_size,
                    sections=[dict(id=s['id'], title_zh=s['title_zh'], title_en=s['title_en'],
                                   verses=[v['n'] for v in s['verses']]) for s in book['sections']],
                    segments=manifest_segs)
    (outdir / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=1))
    print(f'✓ {mp3}  {len(a) / SR / 60:.1f} min, {mp3.stat().st_size / 1e6:.1f} MB, {len(manifest_segs)} segments')


def validate(book):
    errs = []
    for sec in book['sections']:
        for v in sec['verses']:
            for k in ('lines', 'words', 'grammar', 'translation'):
                if not v.get(k): errs.append(f"verse {v['n']}: missing {k}")
            if len(v.get('lines', [])) != 2: errs.append(f"verse {v['n']}: needs 2 lines")
            for w in v.get('words', []):
                for k in ('skt', 'en', 'zh', 'note'):
                    if not w.get(k): errs.append(f"verse {v['n']} {w.get('skt')}: missing {k}")
                # vowels at word junctions merge (tatra + ālaya → tatrālaya), so compare with lengths folded
                fold = lambda x: re.sub(r"[^a-zṛṝḷṃṁḥṅñṭḍṇśṣ]", '', x.lower().translate(str.maketrans('āīū', 'aiu')))
                form = fold(w.get('form', w['skt']))
                if form and form not in fold(''.join(v['lines']).replace("'", 'a')):
                    errs.append(f"verse {v['n']}: form '{w.get('form', w['skt'])}' not found in the verse")
            for q in v.get('xuanzang', []):
                if not re.match(r'^[A-Z]+\d+n\w+_p\d{4}[a-z]\d{2}$', q.get('ref', '')): errs.append(f"verse {v['n']}: bad Xuanzang ref")
    if errs:
        sys.exit('\n'.join('✗ ' + e for e in errs))


def main():
    bookdir = Path(sys.argv[1]).resolve()
    step = sys.argv[2] if len(sys.argv) > 2 else 'all'
    book = yaml.safe_load((bookdir / 'script.yaml').read_text())
    cfg = {**DEFAULTS, **(book.get('audio') or {})}
    for k in list(cfg):
        if os.environ.get(f'AB_{k.upper()}'): cfg[k] = os.environ[f'AB_{k.upper()}']  # overrides for A/B samples
    validate(book)
    cache = Path.home() / '.cache' / 'sbt-tts' / 'books' / book['id']
    segs = timeline(book, cfg)
    if step == 'voices': return check_voice(cfg)
    if step in ('skt', 'all'): synth_skt(cache, skt_units(segs), cfg, redo=set(sys.argv[3:]))
    if step in ('tts', 'all'): synth_tts(segs, cache, cfg)
    if step in ('build', 'all'): build(book, segs, cache, cfg, bookdir / 'out')


if __name__ == '__main__':
    main()
