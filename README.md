<p align="center"><img src="public/logo.svg" width="96" alt="Spokarr logo"></p>

<h1 align="center">Spokarr</h1>

<p align="center">Request audiobooks the way you request movies in Seerr – Spokarr finds the right edition, downloads it and files it into your Audiobookshelf library.</p>

---

## Why

Readarr is built around books, not audiobooks: its metadata rarely knows narrators, editions or
non-English titles, so finding *the* recording you want is guesswork. Spokarr starts from the Audible
catalog instead. You pick the exact edition – narrator, abridged or not, language – and Spokarr looks
for a release that matches it.

## Features

- **Discover and search** the Audible catalog (any region: US, UK, DE, FR, …) with covers, narrators,
  length, series and edition.
- **One-tap requests**: Spokarr searches your Newznab indexer, scores every release (title, narrator,
  language, abridged vs. unabridged, dramatization, size per minute) and sends the best one to SABnzbd.
- **Manual pick**: “View releases” shows all results with the reasons behind each score.
- **Clean import**: finished downloads are moved to `Author/Title`, get a `metadata.json` and cover,
  and Audiobookshelf is told to scan and match the book against Audible.
- **Library status**: books you already own show as *Available*, running downloads with progress.
- **Audiobookshelf accounts**: everyone signs in with their Audiobookshelf username and password – no
  separate accounts, no stored passwords. Imported books are tagged “Requested by <name>” in
  Audiobookshelf, so people find their requests there too.
- **Users and permissions**: request, auto-approve and manage requests per user; requests from users
  without auto-approve wait for an admin.
- **Settings in the browser**: Audible store, discover rows, Audiobookshelf, SABnzbd and any number of
  indexers, each with a connection test.
- **Mobile first**, installable as a home-screen app, English and German interface.
- No database, no dependencies – plain Node.js and a static web app.

## Requirements

- A Newznab-compatible indexer with an audiobook category
- SABnzbd
- Audiobookshelf 2.26 or newer (used for sign-in)
- Docker, or Node.js 20+

## Quick start (Docker)

```bash
git clone https://github.com/<you>/spokarr.git
cd spokarr
docker compose up -d --build
```

Open `http://<host>:5057` and follow the setup:

1. Enter the address of your Audiobookshelf server.
2. Sign in with an Audiobookshelf **administrator** account. You become the owner of Spokarr, and
   Spokarr creates its own API key in Audiobookshelf.
3. Under **Settings**, add SABnzbd and your indexers and pick the Audiobookshelf library.

In SABnzbd, create the category Spokarr uses (default `spokarr`). SABnzbd's download folder and the
library folder should be on the same disk so imports are an instant move.

Other Audiobookshelf users can sign in right away, or an admin imports them all under **Users**.

## Configuration

Everything is configured in the web interface and stored in `data/settings.json`. Environment
variables (see [`.env.example`](.env.example)) are only read on the very first start, which is handy for
automated deployments.

| Variable | Description |
|---|---|
| `AUDIBLE_REGION` | Audible store for the catalog: `us`, `uk`, `ca`, `au`, `in`, `de`, `fr`, `it`, `es`, `jp` |
| `CONTENT_LANGUAGE` | Language shown on the discover page (defaults to the region's language) |
| `LIBRARY_DIR` | Where finished audiobooks are placed (inside the container) – the only setting not editable in the UI |
| `NEWZNAB_URL`, `NEWZNAB_API_KEY`, `NEWZNAB_CATEGORIES` | Your indexer |
| `SAB_URL`, `SAB_API_KEY`, `SAB_CATEGORY` | SABnzbd |
| `ABS_URL`, `ABS_API_KEY`, `ABS_PUBLIC_URL`, `ABS_LIBRARY_ID`, `ABS_LIBRARY_MOUNT` | Audiobookshelf |
| `DISCOVER_ROWS` | Extra discover rows, e.g. `Fantasy|fantasy;Read by Stephen Fry|Stephen Fry|Stephen Fry` |

## How releases are scored

| Signal | Effect |
|---|---|
| Share of title words found in the release name | up to +60, below 75 % the release is not picked automatically |
| Narrator's name in the release | +25 |
| Release names the book's language / another language | +10 / −50 |
| Dramatization or full-cast edition for a regular reading | −30 |
| Abridged release for an unabridged book | −25 |
| Implausibly small for the runtime | −30 |

A release is picked automatically at 50 points or more. Everything else can be chosen by hand.

## Adding a language

Translations live in [`public/i18n.js`](public/i18n.js). Copy the `en` block, translate it and add the
language to `LANGUAGES`. Pull requests welcome.

## Legal

Spokarr is a search and automation tool. It does not host, index or provide any content. You are
responsible for complying with the laws of your country and the terms of the services you connect.
Audible is a trademark of Audible, Inc.; Spokarr is not affiliated with Audible or Amazon.

## License

[MIT](LICENSE)
