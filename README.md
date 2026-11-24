<p align="center"><img src="public/logo.svg" width="110" alt="Spokarr logo"></p>

<h1 align="center">Spokarr</h1>

<p align="center">
  <b>Request audiobooks like you request movies in Seerr.</b><br>
  Spokarr finds the exact edition you want, downloads it and files it into your Audiobookshelf library.
</p>

<p align="center">
  <a href="https://github.com/BlugDeg/Spokarr/actions/workflows/docker.yml"><img alt="Docker image" src="https://github.com/BlugDeg/Spokarr/actions/workflows/docker.yml/badge.svg"></a>
  <a href="https://github.com/BlugDeg/Spokarr/releases"><img alt="Latest release" src="https://img.shields.io/github/v/release/BlugDeg/Spokarr?color=8b5cf6"></a>
  <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-6366f1">
  <img alt="Node.js 20+" src="https://img.shields.io/badge/node-%E2%89%A520-8b5cf6">
  <img alt="Platforms" src="https://img.shields.io/badge/platforms-amd64%20%7C%20arm64-6366f1">
  <img alt="No dependencies" src="https://img.shields.io/badge/dependencies-none-8b5cf6">
  <img alt="Languages" src="https://img.shields.io/badge/UI-English%20%7C%20Deutsch-6366f1">
</p>

<p align="center"><img src="docs/screenshots/demo.gif" alt="Discover, search, request and listen" width="900"></p>

---

## What makes Spokarr different

- **The exact recording, not just the book.** You pick an edition from the Audible catalog – narrator,
  unabridged or abridged, language – and Spokarr scores every release against it. A full-cast
  dramatization or an English release won't sneak in when you asked for a German reading.
- **Built for audiobooks in any language.** Every Audible store works (US, UK, DE, FR, IT, ES, JP, …),
  release names in other languages are matched properly, umlauts included.
- **No new accounts.** Everyone signs in with their Audiobookshelf account; requests show up in
  Audiobookshelf tagged with who asked for them.
- **Light enough for a Raspberry Pi.** One small Node.js process without dependencies and JSON files
  instead of a database.

### Why not Readarr?

Readarr is built around *books*. Its metadata rarely knows narrators, editions or non-English titles,
so getting the recording you want is guesswork. Spokarr starts from the Audible catalog instead, finds a
matching release on your indexers (directly or through Prowlarr), sends it to SABnzbd or qBittorrent
and hands the finished book to Audiobookshelf – already matched, with cover, chapters and narrator.

## Features

**For listeners**
- 🔎 **Discover and search** the Audible catalog of any store (US, UK, DE, FR, …) – covers, narrators,
  length, series, abridged or unabridged.
- ➕ **One-tap requests** and a clear status for every book: pending, downloading with progress,
  available.
- 🎧 **Straight to listening**: “Listen in Audiobookshelf” opens the book in your library.
- 🔐 **Sign in with Audiobookshelf** – same username and password, no extra accounts. Spokarr never
  stores passwords.
- 📱 **Mobile first**, installable as a home-screen app. English and German interface.

**For admins**
- ✅ **Approval workflow** like Seerr: per-user permissions to request, auto-approve and manage requests.
- 👥 **User management** with roles, request counts and last sign-in – plus a one-click import of all
  Audiobookshelf users.
- 🧠 **Smart release matching**: every result is scored on title, narrator, language, abridged vs.
  unabridged, dramatizations and size per minute. “View releases” shows the score and the reasons, and
  lets you pick a release by hand.
- 🗂️ **Clean import**: downloads are moved to `Author/Title`, get a `metadata.json` and a cover,
  Audiobookshelf scans and matches the book, and it is tagged “Requested by &lt;name&gt;”.
- 🔌 **Prowlarr, SABnzbd and qBittorrent**: search all your Prowlarr indexers at once or add Newznab
  indexers directly; usenet releases go to SABnzbd, torrents to qBittorrent. Torrents keep seeding –
  Spokarr hardlinks (or copies) the files into the library.
- 🔔 **Notifications** via Discord and ntfy: new requests waiting for approval, approvals, books ready to
  listen to, declined requests and problems – in English or German, with cover and a link to the book.
- 🐌 **Stalled downloads** are detected (no progress for a configurable time) and reported. “Search again”
  picks another release and removes the stalled one from the download client – only if a better release
  was found.
- ⚙️ **Settings in the browser**: Audible store, discover rows, Audiobookshelf, download clients, Prowlarr
  and indexers – each with a connection test, plus path mapping when a client sees the disk differently.
- 🪶 **Lightweight**: plain Node.js without dependencies and JSON files instead of a database – runs fine
  on a Raspberry Pi.

## Screenshots

| Discover | Book details |
|---|---|
| ![Discover page](docs/screenshots/discover.png) | ![Book details with approval](docs/screenshots/book.png) |
| **Requests** | **Users** |
| ![Requests with filters](docs/screenshots/requests.png) | ![User management](docs/screenshots/users.png) |
| **Prowlarr and indexers** | **Download clients** |
| ![Indexer settings](docs/screenshots/settings.png) | ![SABnzbd and qBittorrent settings](docs/screenshots/settings-downloads.png) |
| **Notifications** | **Sign in with Audiobookshelf** |
| ![Discord and ntfy notifications](docs/screenshots/settings-notifications.png) | ![Sign in with your Audiobookshelf account](docs/screenshots/login.png) |

<p align="center">
  <img src="docs/screenshots/mobile-discover.png" width="240" alt="Discover on a phone">
  &nbsp;
  <img src="docs/screenshots/mobile-book.png" width="240" alt="Book on a phone">
  &nbsp;
  <img src="docs/screenshots/mobile-requests.png" width="240" alt="Requests on a phone">
</p>

## How it works

```
 Audible catalog ──► you pick an edition ──► Prowlarr / Newznab ──► scored releases
                                                                          │
 Audiobookshelf ◄── scan + match + tag ◄── import to Author/Title ◄── SABnzbd / qBittorrent
```

## Requirements

- [Audiobookshelf](https://www.audiobookshelf.org/) **2.26 or newer** – used for sign-in and as the library
- A download client: [SABnzbd](https://sabnzbd.org/) (usenet) and/or [qBittorrent](https://www.qbittorrent.org/) 4.1+ (torrents)
- Indexers: [Prowlarr](https://prowlarr.com/) and/or Newznab indexers with an audiobook category
- Docker – or Node.js 20+

## Installation

### Docker

Ready-made images for **amd64** (PC, NAS) and **arm64** (Raspberry Pi 4/5) are published to the GitHub
Container Registry:

| Tag | Meaning |
|---|---|
| `ghcr.io/blugdeg/spokarr:latest` | latest release |
| `ghcr.io/blugdeg/spokarr:0.2` | latest 0.2.x release |
| `ghcr.io/blugdeg/spokarr:edge` | current `main` branch |

```bash
docker run -d --name spokarr --restart unless-stopped \
  -p 5057:5057 \
  -v ./data:/data \
  -v /path/to/media:/media \
  -e LIBRARY_DIR=/media/audiobooks \
  --user 1000:1000 \
  ghcr.io/blugdeg/spokarr:latest
```

### Docker Compose

```yaml
services:
  spokarr:
    image: ghcr.io/blugdeg/spokarr:latest
    container_name: spokarr
    restart: unless-stopped
    ports:
      - "5057:5057"
    volumes:
      - ./data:/data                 # settings, users, requests
      - /path/to/media:/media        # the disk with SABnzbd's downloads and your audiobooks
    environment:
      LIBRARY_DIR: /media/audiobooks # where Spokarr puts finished audiobooks
    user: "1000:1000"                # the user that owns your media files
```

```bash
docker compose up -d
```

**Updating:** `docker compose pull && docker compose up -d`. Your settings in `data/` are kept.

### Without Docker

```bash
git clone https://github.com/BlugDeg/Spokarr.git
cd Spokarr
DATA_DIR=./data LIBRARY_DIR=/path/to/audiobooks node server.mjs
```

### First start

Open `http://<host>:5057` and follow the setup:

1. **Connect Audiobookshelf** – enter its address as the Spokarr server reaches it.
2. **Sign in as an Audiobookshelf administrator.** You become the owner of Spokarr, and Spokarr creates
   its own API key in Audiobookshelf.
3. Under **Settings**, add your **download clients** (SABnzbd, qBittorrent), **Prowlarr** or Newznab
   **indexers**, and choose the Audiobookshelf **library**.

In your download clients, create the category Spokarr uses (default `spokarr`). Put the download folders
and the library on the **same disk**: usenet downloads are then moved instantly, and torrents are
hardlinked instead of copied. If a client runs in another container and sees the disk under another
path, set the **path mapping** for that client.

**Categories:** Spokarr searches category `3030` (Audio/Audiobook) by default. Some indexers file
audiobooks only under `3000` (Audio) – add it if a search finds nothing.

Other people can sign in right away with their Audiobookshelf accounts – or import them all under
**Users**.

## Configuration

Everything is configured in the web interface and stored in `data/settings.json`.

| Environment variable | Purpose |
|---|---|
| `PORT` | Port of the web interface (default `5057`) |
| `DATA_DIR` | Folder for settings, users and requests (default `/data`) |
| `LIBRARY_DIR` | Folder where finished audiobooks are placed (default `/audiobooks`) |

All other variables in [`.env.example`](.env.example) are optional and only read on the very first start
to pre-fill the settings – handy for automated deployments.

### Permissions

| Permission | Allows |
|---|---|
| Request audiobooks | Request books. |
| Auto-approve | Requests are downloaded right away instead of waiting for an admin. |
| Manage requests | See all requests, approve or decline them and pick releases by hand. |

Admins have every permission and can change settings. Audiobookshelf administrators become Spokarr admins
on their first sign-in; everyone else gets the default permissions from **Settings → General**.

### How releases are scored

| Signal | Effect |
|---|---|
| Share of title words found in the release name | up to +60; below 75 % a release is never picked automatically |
| Narrator's name in the release | +25 |
| Release names the book's language / another language | +10 / −50 |
| Dramatization, full-cast or radio adaptation for a regular reading | −30 |
| Abridged release for an unabridged book | −25 |
| Implausibly small for the runtime | −30 |
| Torrent without seeders | −40, never picked automatically |
| No download client for the release type (usenet/torrent) | never picked automatically |

A release is picked automatically at 50 points or more. Everything else can be chosen under
**View releases**.

## Security notes

- Passwords are checked by Audiobookshelf and never stored. Sessions are random tokens in an
  `HttpOnly`, `SameSite=Lax` cookie; only their hashes are saved.
- Failed sign-ins are rate-limited (8 attempts per 15 minutes and IP).
- API keys are stored in `data/settings.json` with file mode `600` and never sent to the browser.
- Put Spokarr behind HTTPS (e.g. a reverse proxy) if you expose it to the internet.

## Contributing

Bug reports, ideas and pull requests are welcome – see [CONTRIBUTING.md](CONTRIBUTING.md). Changes are
listed in the [changelog](CHANGELOG.md). Please report security problems privately, see
[SECURITY.md](SECURITY.md).

## Translating

Translations live in [`public/i18n.js`](public/i18n.js). Copy the `en` block, translate it and add the
language to `LANGUAGES` – pull requests are very welcome.

## Legal

Spokarr is a search and automation tool. It does not host, index or provide any content. You are
responsible for complying with the laws of your country and the terms of the services you connect.
Audible is a trademark of Audible, Inc. Spokarr is not affiliated with Audible, Amazon or
Audiobookshelf. Covers in the screenshots are shown for illustration and belong to their publishers.

## License

[MIT](LICENSE)
