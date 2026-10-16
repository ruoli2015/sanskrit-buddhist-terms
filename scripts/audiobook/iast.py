"""IAST → Devanagari (same rules as app/js/audio.js, plus avagraha and dandas)."""
import unicodedata

V = {'a': 'अ', 'ā': 'आ', 'i': 'इ', 'ī': 'ई', 'u': 'उ', 'ū': 'ऊ', 'ṛ': 'ऋ', 'ṝ': 'ॠ', 'ḷ': 'ऌ',
     'e': 'ए', 'ai': 'ऐ', 'o': 'ओ', 'au': 'औ'}
M = {'a': '', 'ā': 'ा', 'i': 'ि', 'ī': 'ी', 'u': 'ु', 'ū': 'ू', 'ṛ': 'ृ', 'ṝ': 'ॄ', 'ḷ': 'ॢ',
     'e': 'े', 'ai': 'ै', 'o': 'ो', 'au': 'ौ'}
C = {'kh': 'ख', 'gh': 'घ', 'ch': 'छ', 'jh': 'झ', 'ṭh': 'ठ', 'ḍh': 'ढ', 'th': 'थ', 'dh': 'ध', 'ph': 'फ',
     'bh': 'भ', 'k': 'क', 'g': 'ग', 'ṅ': 'ङ', 'c': 'च', 'j': 'ज', 'ñ': 'ञ', 'ṭ': 'ट', 'ḍ': 'ड', 'ṇ': 'ण',
     't': 'त', 'd': 'द', 'n': 'न', 'p': 'प', 'b': 'ब', 'm': 'म', 'y': 'य', 'r': 'र', 'l': 'ल', 'v': 'व',
     'ś': 'श', 'ṣ': 'ष', 's': 'स', 'h': 'ह'}
VK = sorted(V, key=len, reverse=True)
CK = sorted(C, key=len, reverse=True)


def to_deva(text):
    s = unicodedata.normalize('NFC', text.lower()).replace('//', '॥').replace('/', '।')
    out, i, after_c = [], 0, False
    while i < len(s):
        c = next((k for k in CK if s.startswith(k, i)), None)
        if c:
            if after_c:
                out.append('्')
            out.append(C[c]); i += len(c); after_c = True
            continue
        v = next((k for k in VK if s.startswith(k, i)), None)
        if v:
            out.append(M[v] if after_c else V[v]); i += len(v); after_c = False
            continue
        ch = s[i]
        if after_c and ch not in 'ṃṁḥ':
            out.append('्')
        if ch in 'ṃṁ': out.append('ं')
        elif ch == 'ḥ': out.append('ः')
        elif ch in "'’": out.append('ऽ')
        elif ch in '।॥': out.append(ch)
        elif ch.isspace() or ch == '-': out.append(' ')  # a compound boundary is read as a short break
        after_c = False
        i += 1
    if after_c:
        out.append('्')
    return ' '.join(''.join(out).replace(' ऽ', 'ऽ').split())
