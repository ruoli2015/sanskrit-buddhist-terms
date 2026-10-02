# Generate K takes per term with Indic Parler-TTS (voice "Aryan"); resumable.
import json, os, sys, time, torch, soundfile as sf
from parler_tts import ParlerTTSForConditionalGeneration
from transformers import AutoTokenizer
K = int(os.environ.get("K", "3"))
only = set(sys.argv[1:])
terms = [t for t in json.load(open("terms.json")) if not only or t["id"] in only]
model = ParlerTTSForConditionalGeneration.from_pretrained("ai4bharat/indic-parler-tts").to("cpu")
tok = AutoTokenizer.from_pretrained("ai4bharat/indic-parler-tts")
dtok = AutoTokenizer.from_pretrained(model.config.text_encoder._name_or_path)
desc = "Aryan speaks slowly and distinctly with very clear audio, close up, with no background noise."
d = dtok(desc, return_tensors="pt")
sr = model.config.sampling_rate
start = time.time()
for i, t in enumerate(terms):
    p = tok(t["deva"] + "।", return_tensors="pt")
    for k in range(1, K + 1):
        out = f"takes/{t['id']}-{k}.wav"
        if os.path.exists(out) and not only: continue
        for attempt in range(8):
            torch.manual_seed(k * 7919 + attempt * 104729 + i)
            g = model.generate(input_ids=d.input_ids, attention_mask=d.attention_mask,
                               prompt_input_ids=p.input_ids, prompt_attention_mask=p.attention_mask)
            a = g.cpu().numpy().squeeze()
            if a.ndim == 1 and len(a) > 0.35 * sr: break
        sf.write(out, a, sr)
    print(f"[{i+1}/{len(terms)}] {t['id']} {time.time()-start:.0f}s", flush=True)
