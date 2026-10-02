# Pick the best take per term using Whisper as a sanity check, then write app/audio/<id>.m4a.
#   env/bin/python select.py <path-to-app-audio-dir> [ids...]
import glob, json, os, subprocess, sys, tempfile
import numpy as np, soundfile as sf, whisper
from scorelib import skeleton, score, load16k, trim
outdir = sys.argv[1]
only = set(sys.argv[2:])
terms = [t for t in json.load(open("terms.json")) if not only or t["id"] in only]
report = json.load(open("report.json")) if os.path.exists("report.json") else {}
model = whisper.load_model("turbo")
for t in terms:
    best = None
    for f in sorted(glob.glob(f"takes/{t['id']}-*.wav")):
        a16, _ = load16k(f)
        raw, sr = sf.read(f)
        trimmed = trim(raw, sr)
        dur = len(trimmed) / sr
        heard = model.transcribe(a16, language="hi", fp16=False, temperature=0, condition_on_previous_text=False)["text"].strip()
        sim, per, dur_ok = score(t["deva"], heard, dur)
        repeat = len(skeleton(heard)) > 1.6 * len(skeleton(t["deva"])) + 1
        final = sim - (0 if dur_ok else 0.3) - (0.3 if repeat else 0)
        cand = dict(file=f, heard=heard, sim=round(sim, 2), dur=round(dur, 2), final=round(final, 2))
        if best is None or final > best["final"]: best = cand; best_audio = (trimmed, sr)
    a, sr = best_audio
    a = a / (np.abs(a).max() + 1e-9) * 10 ** (-1 / 20)
    with tempfile.NamedTemporaryFile(suffix=".wav") as tmp:
        sf.write(tmp.name, a, sr)
        subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", "-c", "1", "-b", "48000", tmp.name, os.path.join(outdir, f"{t['id']}.m4a")], check=True)
    report[t["id"]] = dict(deva=t["deva"], skt=t["skt"], **best)
    flag = "  ⚑ LOW" if best["final"] < 0.6 else ""
    print(f"{t['id']:24} {best['final']:.2f} {best['dur']:.2f}s  {t['deva']} → {best['heard']}{flag}", flush=True)
    json.dump(report, open("report.json", "w"), ensure_ascii=False, indent=1)
