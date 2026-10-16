# Audiobooks

Private audiobooks of Sanskrit texts. Each verse is read in Sanskrit, then explained word by word
(spelling → word → English and Chinese meaning → grammar note in plain English), then the grammar of
the whole verse, a translation and Xuanzang's Chinese, and the verse is read again.

**Book content is private.** Scripts, source texts and audio live in `private/` (gitignored) and in
the private Supabase bucket `audiobooks`, never in `app/` (GitHub Pages is public).

```
private/audiobooks/<id>/script.yaml    the script (markup: {iast} = Sanskrit word, [shown|spoken])
private/audiobooks/<id>/out/           built <id>.mp3 + manifest.json
~/.cache/sbt-tts/books/<id>/           clip cache (each clip is keyed by its content)
```

One-time setup:

1. Python env outside Google Drive, as in `scripts/audio/README.md`, plus `lameenc pyyaml requests opencc-python-reimplemented`.
2. `.env` in the repo root (gitignored):
   ```
   AZURE_SPEECH_KEY=…          # Azure Speech, free tier F0
   AZURE_SPEECH_REGION=eastus
   SUPABASE_SECRET_KEY=…       # Supabase → Project Settings → API Keys → secret key
   ```
3. Run `supabase/audiobooks.sql` in the Supabase SQL editor, then the commented line at its end with your email.

Making a book:

```sh
PY=~/.cache/sbt-tts/env/bin/python
$PY scripts/audiobook/make.py private/audiobooks/<id> voices   # Azure voice available?
$PY scripts/audiobook/make.py private/audiobooks/<id> all      # Sanskrit (Parler + Whisper) → Azure → MP3
K=10 $PY scripts/audiobook/make.py private/audiobooks/<id> skt hi saḥ   # redo weak Sanskrit clips
node scripts/audiobook/upload.mjs private/audiobooks/<id>       # appears in the app, no deploy needed
node scripts/audiobook/upload.mjs --list | --remove <id>
```

Voices: Sanskrit is Indic Parler-TTS ("Aryan"); English and Chinese is Azure `zh-CN-YunyiMultilingualNeural`.
Sanskrit words inside English sentences are rendered by leaving a timed break in the Azure audio and
filling it with the Parler clip. The free Azure tier allows about 20 requests a minute, so `make.py` paces itself.
