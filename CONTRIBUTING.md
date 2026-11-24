# Contributing

Thanks for helping! Bug reports, ideas, translations and pull requests are all welcome.

## Before you start

- For larger changes, open an issue first so we can agree on the approach.
- Spokarr has **no dependencies** on purpose: plain Node.js (20+) on the server and plain JavaScript
  modules in the browser. Please keep it that way.

## Development

```bash
git clone https://github.com/BlugDeg/Spokarr.git
cd Spokarr
DATA_DIR=./data LIBRARY_DIR=./library node server.mjs   # http://localhost:5057
npm run check                                           # syntax check of all files
```

There is no build step – edit, reload the browser.

## Guidelines

- Code, comments and commit messages in English.
- New user-facing text goes into [`public/i18n.js`](public/i18n.js) – English, and German if you can
  (otherwise leave the German entry out, English is used as fallback).
- Keep personal data out of the code and screenshots: no real IP addresses, domains, user names or
  API keys.
- Every server route checks permissions; new routes must do the same.

## Translations

Copy the `en` block in [`public/i18n.js`](public/i18n.js), translate it and add the language to
`LANGUAGES`. That's all.
