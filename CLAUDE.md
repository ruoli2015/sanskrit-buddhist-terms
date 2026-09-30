# Notes for Claude

- The user studies Buddhist doctrine. The primary framework is Yogācāra (百法, 成唯識論). Note where 俱舍/Sarvāstivāda and Pāli Abhidhamma differ.
- Chinese is traditional characters only. Every explanation is bilingual (`*_zh` and `*_en`).
- Never write a scripture quote from memory. Find it with `scripts/cbeta.mjs` (search → kwic → lines), copy the exact text with its linehead `ref`/`refEnd`, and run `node scripts/cbeta.mjs verify` before committing.
- Every new term goes into a list in `content/lists.yaml`, or it will never be introduced. Add comparison cards (`content/comparisons/`) for confusable terms, with 5–10 questions each.
- `npm run build && npm test` must pass. `app/data/content.json` and `app/sw.js` are generated; commit them along with the YAML.
- `node_modules` holds only the build dependencies (yaml, opencc-js). The folder lives in Google Drive, so do not add heavy dependencies. Bundle vendor libraries into `app/vendor/` elsewhere.
