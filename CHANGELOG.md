# Changelog

All notable changes to Spokarr. The format follows [Keep a Changelog](https://keepachangelog.com/),
versions follow [Semantic Versioning](https://semver.org/).

## [0.12.0] – 2026-11-27

### Added
- **Deluge** as torrent client (Deluge 2.x and 1.3, through the web interface): address and web
  password, optional label (Label plugin) and download folder, path mapping, connection test with
  version and a note when the Label plugin is off. If the web interface is not connected to a daemon,
  Spokarr connects it to the first one. Used for torrents when qBittorrent and Transmission are off.
  Suggested on Reddit – thanks!

## [0.11.0] – 2026-11-27

### Added
- **Single sign-on (OIDC)** with Authentik, Authelia, Keycloak, Pocket ID and other OpenID Connect
  providers (Settings → Audiobookshelf → Single sign-on). The person is matched to their Audiobookshelf
  account by username (`preferred_username`, configurable), otherwise by verified email. Authorization
  code flow with PKCE, ID tokens checked against the provider's keys. The password form can be hidden
  behind a link. Requested by heschdy and peanutbother (#10) – thanks!
- **Hide genres on Discover** (Settings → General → Hide genres): books of these genres no longer show
  up in Popular, New releases and your own rows; search and genre rows are not affected. Suggested by
  hymner (#13) – thanks!
- The **book page shows the genre** (Audible's category path); every step opens the genre search.

## [0.10.1] – 2026-11-26

### Fixed
- **Wrong book for short titles:** a request for "The Knot" downloaded "Untying the Knot" by another
  author, because every word of a short title was in the release name. Titles of one or two words
  (articles not counted) now need the author in the release name as well; otherwise the release is
  still listed, but not picked automatically. Reported by hymner (#11) – thanks!
- Author and narrator lists only show books the person is really credited on (Audible's filter also
  returned "Dale Carnegie" for "Jim Dale"). By TheLord83 (#12).

### Added
- Setting *Release selection → Author must be in the release name* to apply the author check to every
  title. Off by default, because many releases (especially German usenet ones) leave the author out.
- Releases show "Author in name" / "Author not named" among the reasons.

## [0.10.0] – 2026-11-25

### Added
- **Author, narrator and series are links** on the book page (header and details table). Each opens a
  list of its own: all books of the author, all books read by the narrator, or all parts of a series
  in order. A book in two series links both. By TheLord83 (#9) – thanks!
- **Sort orders** for these lists (popular, newest, oldest, best rated, longest, title A–Z, and part
  number for a series), for the keyword search (relevance plus the same orders), for the requests list
  (newest, oldest, title, status) and for the releases of a book (match, largest, newest, most seeders,
  source).

## [0.9.0] – 2026-11-25

### Added
- **Manual requests** for books that are not, or no longer, in the Audible catalog (older readings such
  as Nigel Planer's Discworld, radio plays, CD editions): title, author, narrator, language, year,
  abridged. Spokarr searches the indexers with title (and title + narrator), scores the releases as usual
  and – if wanted – only picks releases that name the narrator. The book is imported with its own
  metadata and not matched against Audible, so the current edition does not overwrite the narrator.
  "Request manually" on the search results and the requests page. Suggested on Reddit – thanks!
- Manual requests are made in two steps: search first, then **pick a release** from the list (best
  matches on top, with score and reasons). Nothing is downloaded before that. Without auto-approve the
  pick waits for approval, and the admin sees which release was chosen.
- Type "radio play" for manual requests: radio plays are preferred instead of penalised.

### Fixed
- An author reading their own book counted as narrator match for every release (the author's name is in
  all of them); now only with an explicit "read by" / "gelesen von".
- Open dialogs stayed on screen after navigating with the back button.

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
