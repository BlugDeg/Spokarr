# Changelog

All notable changes to Spokarr. The format follows [Keep a Changelog](https://keepachangelog.com/),
versions follow [Semantic Versioning](https://semver.org/).

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

[0.4.1]: https://github.com/BlugDeg/Spokarr/releases/tag/v0.4.1
[0.4.0]: https://github.com/BlugDeg/Spokarr/releases/tag/v0.4.0
[0.3.0]: https://github.com/BlugDeg/Spokarr/releases/tag/v0.3.0
[0.2.1]: https://github.com/BlugDeg/Spokarr/releases/tag/v0.2.1
[0.2.0]: https://github.com/BlugDeg/Spokarr/releases/tag/v0.2.0
[0.1.0]: https://github.com/BlugDeg/Spokarr/commits/main
