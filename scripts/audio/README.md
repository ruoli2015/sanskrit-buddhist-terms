# Pronunciation audio

`app/audio/<term-id>.m4a` is generated with the Sanskrit voice "Aryan" of
[Indic Parler-TTS](https://huggingface.co/ai4bharat/indic-parler-tts) (AI4Bharat + Hugging Face, Apache-2.0).
The model is gated: accept its terms on Hugging Face and set `HF_TOKEN` for the first download.

Run outside Google Drive (the Python environment is several GB):

```sh
uv venv --python 3.11 env
uv pip install --python env/bin/python torch soundfile scipy openai-whisper "git+https://github.com/huggingface/parler-tts.git"
node -e "const c=require('<repo>/app/data/content.json');require('fs').writeFileSync('terms.json',JSON.stringify(c.terms.map(t=>({id:t.id,skt:t.skt,deva:t.deva}))))"
env/bin/python gen_all.py [ids...]                  # K takes per term (K=3 default) → takes/
env/bin/python select.py <repo>/app/audio [ids...]  # Whisper sanity check, keep best take → .m4a
```

`select.py` transcribes every take with Whisper (Hindi mode), compares the consonant skeleton with the
Devanagari, checks duration per syllable and repetitions, and keeps the best take. Terms scoring
below 0.6 are flagged in `report.json` for regeneration or listening. Run the CPU device: on Apple
GPUs (MPS) the model returns empty audio.
