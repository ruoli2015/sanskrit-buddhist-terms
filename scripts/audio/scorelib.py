import re, difflib, numpy as np, soundfile as sf
from scipy.signal import resample_poly
VOWEL_SIGNS = set('ािीुूृॄेैोौॢॣ')
STRIP = set('्ंःँ़।॥ ') | VOWEL_SIGNS
EQUIV = {'ण':'न','ञ':'न','ङ':'न','ष':'श','स':'श','ळ':'ल','ढ':'ड','ठ':'ट','व':'ब','ऋ':'र','ृ':'र'}
def skeleton(s):
    s = s.replace('ज्ञ', 'ग्य').replace('क्ष', 'कश')
    out = []
    for c in s:
        if c == 'ृ': out.append('र'); continue
        if c in STRIP or not ('ऀ' <= c <= 'ॿ'): continue
        out.append(EQUIV.get(c, c))
    return ''.join(out)
def syllables(deva):
    n = 0
    for i, c in enumerate(deva):
        if c in 'अआइईउऊऋएऐओऔ' or c in VOWEL_SIGNS: n += 1
        elif 'क' <= c <= 'ह':
            nxt = deva[i+1] if i + 1 < len(deva) else ''
            if nxt not in VOWEL_SIGNS and nxt != '्': n += 1
    return max(n, 1)
def load16k(path):
    a, sr = sf.read(path)
    if a.ndim > 1: a = a.mean(1)
    return resample_poly(a, 16000, sr).astype(np.float32), len(a) / sr
def trim(a, sr, db=-40, pad=0.08):
    w = max(1, int(sr * 0.02))
    env = np.convolve(np.abs(a), np.ones(w) / w, mode='same')
    idx = np.where(env > env.max() * 10 ** (db / 20))[0]
    if not len(idx): return a
    p = int(sr * pad)
    return a[max(0, idx[0] - p): min(len(a), idx[-1] + p)]
def score(target, heard, dur):
    sim = difflib.SequenceMatcher(None, skeleton(target), skeleton(heard)).ratio()
    syl = syllables(target)
    per = dur / syl
    dur_ok = 0.12 <= per <= 0.55
    return sim, per, dur_ok
