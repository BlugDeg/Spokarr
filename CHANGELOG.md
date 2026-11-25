# Changelog

All notable changes to Spokarr. The format follows [Keep a Changelog](https://keepachangelog.com/),
versions follow [Semantic Versioning](https://semver.org/).

## [0.9.0] – unreleased

### Added
- **Manual requests** for books that are not, or no longer, in the Audible catalog (older readings such
  as Nigel Planer's Discworld, radio plays, CD editions): title, author, narrator, language, year,
  abridged. Spokarr searches the indexers with title (and title + narrator), scores the releases as usual
  and – if wanted – only picks releases that name the narrator. The book is imported with its own
  metadata and not matched against Audible, so the current edition does not overwrite the narrator.
  "Request manually" on the search results and the requests page. Suggested on Reddit – thanks!

## [0.8.0] – 2026-11-25

### Added
- **Invite links** (Users → Invite): the person opens the link, picks a username and password, and
  Spokarr creates the account in Audiobookshelf and in Spokarr with the default permissions, then signs
  them in. Valid for 1, 7 or 30 days, once, 5×, 10× or unlimited; list with use count, copy and delete.
- **Update notice**: admins see "Update available" at the bottom left, linking to the release notes; the
  version number links to its release. Checks the GitHub API twice a day, can be switched off
  (Settings → General, or `UPDATE_CHECK=false`).
- **Reverse proxy support**: `TRUST_PROXY` (default `auto`: trust `X-Forwarded-*` from private addresses).
  Behind HTTPS the session cookie is marked `Secure`; sign-in limits count per visitor. README section with
  Nginx Proxy Manager and Caddy examples.
- About page: author, AI disclosure, releases, icon credits.

### Changed
- Language switch EN | DE instead of a dropdown, also on the sign-in page.
- Settings are more compact: service logos, switched-off services collapse to one line, fields side by
  side where it fits.

### Fixed
- Hidden checkboxes of disabled switches showed up at the right edge of the window (user dialog).
- `X-Forwarded-For` was trusted from anyone, so the sign-in limit could be bypassed by sending the header.

## [0.7.0] – 2026-11-25

### Added
- **Transmission** as a torrent client (RPC; tested with Transmission 4.1.4). Progress, ETA, paused and
  queued states, local errors, label and download folder, path mapping, removal on retry; torrents keep
  seeding and are hardlinked into the library. Spokarr resolves indexer links itself, so redirects to
  magnet links (common with Prowlarr) work. If qBittorrent and Transmission are both enabled,
  qBittorrent is used.

## [0.6.0] – 2026-11-25

### Added
- **Genres**: genre rows on Discover (setting *Genres* or `DISCOVER_GENRES`, picked from all Audible
  categories of the store), genre search with sorting (popular, current bestsellers, newest, best
  rated, oldest, longest) and a setting for the number of books per row. The category tree is only
  loaded when genres are used and cached for 24 h. Thanks @TheLord83 (#6, #3)
- **Row pages**: a Discover row heading opens the row as a page of its own with up to 150 titles.
  Thanks @TheLord83 (#8)

### Fixed
- Cache entries that are still being computed are shared, so two simultaneous requests no longer do
  the same work twice.

## [0.5.2] – 2026-11-25

### Fixed
- A different book with the same title was shown as already in the library (e.g. *Erlösung* by
  Dalzelle vs. Hamilton). The title fallback now also requires the author and only applies to library
  items without ASIN; the author is taken from the folder name if ABS has none. Thanks @TheLord83 (#5, #2)
- Audible answered `503` for minutes after a burst of catalog requests. At most three requests run at
  once now, with retries and backoff on `429`/`502`/`503`. Thanks @TheLord83 (#7)

## [0.5.1] – 2026-11-24

### Fixed
- Import failed with `EXDEV` when downloads and library are on different mounts (e.g. two NFS exports).
  Spokarr now copies and removes the source; a source that cannot be removed (e.g. `.fuse_hidden` files
  on Unraid/NFS) only logs a warning. Thanks @TheLord83 (#4)

## [0.5.0] – 2026-11-24

### Added
- **NZBGet** as a usenet download client (JSON-RPC; tested with NZBGet 26.3). Progress, ETA, paused and
  post-processing states, failed downloads (incl. damaged/password-protected), removal on retry, path
  mapping. If SABnzbd and NZBGet are both enabled, SABnzbd is used.

## [0.4.2] – 2026-11-24

### Added
- `PUID`/`PGID` like linuxserver.io images (default 1000/1000). The container starts as root only to
  hand the data folder to that user, then drops root.
- Unraid template (`unraid/spokarr.xml`).

### Fixed
- A data folder created by Docker (owned by root) could not be written, so settings were not saved.

## [0.4.1] – 2026-11-24

### Added
- Better chapters for releases split into many files (e.g. one file per CD track): consecutive files
  with the same title tag become one chapter. Without usable tags, Audible chapters are used – but only
  if the runtime matches within 1 %, so chapter marks never drift.

## [0.4.0] – 2026-11-24

### Added
- Notifications via Discord webhook and ntfy: new request, approved, available, declined, problem,
  stalled – selectable per channel, English or German, with cover, narrator, requester and link.
- Stalled download detection (no progress for a configurable number of hours). “Search again”
  replaces a stalled download only when another release was found and removes the old one from the
  download client.
- Settings: notifications tab, Spokarr address for links, stall time.

### Fixed
- SABnzbd behind a URL base (e.g. `http://server/sabnzbd`) was not reachable.

## [0.3.0] – 2026-11-24

### Added
- Prowlarr as indexer source (one search across all Prowlarr indexers, usenet and torrent).
- qBittorrent as download client (4.1+, tested with 5.3). Torrents keep seeding; files are hardlinked
  (or copied) into the library.
- Path mapping per download client.
- Release list shows type and seeders.

### Changed
- Releases without a matching download client and torrents without seeders are never picked
  automatically.
- Dramatizations, radio dramas and radio adaptations are recognised.

## [0.2.1] – 2026-11-24

### Added
- Multi-arch Docker images (amd64, arm64) on `ghcr.io/blugdeg/spokarr`.
- Automatic checks for pull requests.

## [0.2.0] – 2026-11-24

### Added
- Sign-in with Audiobookshelf accounts; first administrator becomes owner, Spokarr creates its own
  Audiobookshelf API key.
- Users with roles and permissions, import from Audiobookshelf.
- Request approval workflow; imported books are tagged “Requested by <name>”.
- Settings pages with connection tests.

## [0.1.0] – 2026-11-24

### Added
- First public version: Audible catalog, Newznab search with release scoring, SABnzbd, import into
  Audiobookshelf, English and German interface.

[0.5.1]: https://github.com/BlugDeg/Spokarr/releases/tag/v0.5.1
[0.5.0]: https://github.com/BlugDeg/Spokarr/releases/tag/v0.5.0
[0.4.2]: https://github.com/BlugDeg/Spokarr/releases/tag/v0.4.2
[0.4.1]: https://github.com/BlugDeg/Spokarr/releases/tag/v0.4.1
[0.4.0]: https://github.com/BlugDeg/Spokarr/releases/tag/v0.4.0
[0.3.0]: https://github.com/BlugDeg/Spokarr/releases/tag/v0.3.0
[0.2.1]: https://github.com/BlugDeg/Spokarr/releases/tag/v0.2.1
[0.2.0]: https://github.com/BlugDeg/Spokarr/releases/tag/v0.2.0
[0.1.0]: https://github.com/BlugDeg/Spokarr/commits/main
