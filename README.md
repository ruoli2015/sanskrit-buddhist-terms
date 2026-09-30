# 梵語佛學名相 · Sanskrit Buddhist Terms

A phone-first web app (PWA) for learning Sanskrit Buddhist terms with their Chinese and English translations, in-depth doctrinal explanations, comparisons of easily confused terms, and scripture quotations from CBETA that have been checked word for word.

**App:** https://ruoli2015.github.io/sanskrit-buddhist-terms/

## Using it

- **Install**: open the link on your phone and add it to the home screen. On iPhone, tap Share → *Add to Home Screen*. On Android, tap ⋮ → *Install app*. It works offline.
- **Study in short bursts**: sessions of 5, 15 or 40 cards. Every answer is saved immediately, so you can stop at any point.
- **Stages**: new term → multiple choice → typed Chinese + English. You move to typing after 5 correct answers spread over at least 2 days, then to Chinese → Sanskrit spelling. Two misses in a row move a term back one stage. FSRS spaced repetition decides when each term returns.
- **Retire** a word you know from its page or right after answering. **Add** your own words one at a time, or paste many at once.
- **Sync** across devices by signing in under Settings with your email and a 6-digit code.

## Project layout

```
content/            source of truth for built-in content (YAML)
  lists.yaml        term lists, in the order new terms are introduced
  terms/*.yaml      term entries
  comparisons/*.yaml  confusable-term comparison cards with quiz questions
app/                the static site served by GitHub Pages (no framework build step)
  js/               ES modules (Preact + htm, vendored in app/vendor)
  data/content.json generated from content/ by scripts/build.mjs
scripts/build.mjs   validate + compile content, stamp the service worker
scripts/cbeta.mjs   search CBETA and verify every quote against the canon
supabase/schema.sql database schema for sync
tests/              node --test unit tests
```

## Adding content

1. Add terms to `content/terms/*.yaml` and list them in `content/lists.yaml`. Follow an existing entry for the field layout.
2. Find each quote in CBETA and copy the exact text and line numbers:
   ```sh
   node scripts/cbeta.mjs search 六思身            # which texts contain it
   node scripts/cbeta.mjs kwic 六思身 T0099 2      # line numbers in 雜阿含 fascicle 2
   node scripts/cbeta.mjs lines T02n0099_p0009c07 4
   ```
3. `node scripts/cbeta.mjs verify` confirms that every quote matches the canon (punctuation is ignored, and `……` marks an omission).
4. `npm run build && npm test`, then commit and push. GitHub Actions deploys in about a minute, and installed apps offer to reload.

## Sync setup (one-time)

1. In Supabase, create a project. Then open SQL Editor, paste `supabase/schema.sql` and run it.
2. Go to Authentication → Emails → Templates. In both the *Magic Link* and *Confirm signup* templates, add `{{ .Token }}` so the email contains a 6-digit code.
3. Go to Project Settings → API, copy the Project URL and the anon (publishable) key into `app/js/config.js`, and push.

## Development

```sh
npm install          # yaml + opencc-js, used only by the build script
npm run build        # compile content
npm test
npm run serve        # http://localhost:8080
```

The vendored libraries in `app/vendor/` are bundled with esbuild from `preact`, `htm`, `ts-fsrs` and `@supabase/supabase-js`.
