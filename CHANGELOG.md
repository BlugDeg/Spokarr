# Changelog

All notable changes to Spokarr. The format follows [Keep a Changelog](https://keepachangelog.com/),
versions follow [Semantic Versioning](https://semver.org/).

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
