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
- **Mobile first**, installable as a home-screen app, English and German interface.
- No database, no dependencies – a single Node.js file and a static web app.

## Requirements

- A Newznab-compatible indexer with an audiobook category
- SABnzbd
- Audiobookshelf (optional, but recommended)
- Docker, or Node.js 20+

## Quick start (Docker)

```bash
git clone https://github.com/<you>/spokarr.git
cd spokarr
cp .env.example .env      # fill in your indexer, SABnzbd and Audiobookshelf details
docker compose up -d --build
```

Open `http://<host>:5057`.

In SABnzbd, create the category set in `SAB_CATEGORY` (default `spokarr`). SABnzbd's download folder and
`LIBRARY_DIR` should be on the same disk so imports are an instant move.

## Configuration

All settings are environment variables – see [`.env.example`](.env.example) for the full list.

| Variable | Description |
|---|---|
| `AUDIBLE_REGION` | Audible store for the catalog: `us`, `uk`, `ca`, `au`, `in`, `de`, `fr`, `it`, `es`, `jp` |
| `CONTENT_LANGUAGE` | Language shown on the discover page (defaults to the region's language) |
| `LIBRARY_DIR` | Where finished audiobooks are placed |
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
