"""Pilot A/B samples for choosing settings.
  env/bin/python ab.py <book-dir> <out-dir>
writes  ab-chinese.mp3  traditional vs simplified characters sent to the voice (Whisper compares both)
        ab-inline.mp3   Sanskrit words inside English: Parler clip spliced in vs the Azure voice itself
"""
import sys
from pathlib import Path
import numpy as np, yaml
import make

bookdir, outdir = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()
outdir.mkdir(parents=True, exist_ok=True)
book = yaml.safe_load((bookdir / 'script.yaml').read_text())
base = {**make.DEFAULTS, **(book.get('audio') or {})}
cache = Path.home() / '.cache' / 'sbt-tts' / 'books' / book['id']
verses = [v for s in book['sections'] for v in s['verses']]
zh_samples = [''.join(q['text'] for q in v['xuanzang']) for v in verses] + [w['zh'] for w in verses[0]['words'][:6]]
en_samples = [verses[0]['words'][0]['note'], verses[1]['words'][1]['note']]


def seg(clips):
    return dict(kind='x', clips=clips)


def mp3(name, parts):
    gap = np.zeros(int(0.8 * make.SR), np.float32)
    a = np.concatenate([x for p in parts for x in (p, gap)])
    make.write_mp3(a, outdir / name, base['kbps'])
    print('✓', outdir / name)


# Chinese script
trad, simp = dict(base, zh_script='traditional'), dict(base, zh_script='simplified')
label = lambda t: make.render(cache, base, ('en', t))
make.synth_tts([seg([('en', 'Version A: traditional characters.'), ('en', 'Version B: simplified characters.')])], cache, base)
for cfg in (trad, simp):
    make.synth_tts([seg([('zh', z) for z in zh_samples])], cache, cfg)
import whisper, opencc
from difflib import SequenceMatcher
from scipy.signal import resample_poly
asr, t2s = whisper.load_model('turbo'), opencc.OpenCC('t2s')
clean = lambda s: ''.join(c for c in t2s.convert(s) if '一' <= c <= '鿿')
parts = []
for cfg, name in ((trad, 'Version A: traditional characters.'), (simp, 'Version B: simplified characters.')):
    parts.append(label(name))
    for z in zh_samples:
        a = make.render(cache, cfg, ('zh', z))
        heard = asr.transcribe(resample_poly(a, 16000, make.SR).astype(np.float32), language='zh', fp16=False, temperature=0)['text']
        print(f"{cfg['zh_script'][:4]}  {SequenceMatcher(None, clean(z), clean(heard)).ratio():.2f}  {z} → {heard}")
        parts.append(a)
mp3('ab-chinese.mp3', parts)

# Sanskrit inside English
voice = dict(base, inline='voice')
make.synth_tts([seg([('en', 'Version A: the Sanskrit voice is spliced in.'), ('en', 'Version B: the English voice reads the Sanskrit words.')])], cache, base)
make.synth_tts([seg([('en', t) for t in en_samples])], cache, voice)
parts = [label('Version A: the Sanskrit voice is spliced in.')] + [make.render(cache, base, ('en', t)) for t in en_samples]
parts += [label('Version B: the English voice reads the Sanskrit words.')] + [make.render(cache, voice, ('en', t)) for t in en_samples]
mp3('ab-inline.mp3', parts)
