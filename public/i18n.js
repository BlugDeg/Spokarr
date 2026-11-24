// Translations. English is the base language; add a new language by copying the "en" block.
export const LANGUAGES = { en: 'English', de: 'Deutsch' };

const dict = {
  en: {
    'nav.discover': 'Discover', 'nav.search': 'Search', 'nav.requests': 'Requests', 'nav.users': 'Users',
    'nav.settings': 'Settings', 'nav.listen': 'Listen', 'nav.audiobookshelf': 'Audiobookshelf', 'nav.more': 'More',
    'nav.signOut': 'Sign out',

    'login.title': 'Sign in', 'login.subtitle': 'Use your Audiobookshelf account.',
    'login.username': 'Username', 'login.password': 'Password', 'login.submit': 'Sign in',
    'setup.title': 'Welcome to Spokarr', 'setup.step1': 'Connect Audiobookshelf',
    'setup.step1Text': 'Spokarr uses your Audiobookshelf accounts for sign-in and files finished audiobooks into its library.',
    'setup.url': 'Audiobookshelf address', 'setup.urlHint': 'As reachable from the Spokarr server, e.g. http://audiobookshelf:80',
    'setup.connect': 'Connect', 'setup.step2': 'Sign in as administrator',
    'setup.step2Text': 'The first Audiobookshelf administrator to sign in becomes the owner of Spokarr. Spokarr then creates its own API key in Audiobookshelf.',
    'setup.change': 'Change address',

    'search.placeholder': 'Search audiobooks, authors, narrators', 'search.prompt': 'Enter a title, author or narrator.',
    'search.title': 'Search results', 'search.titleFor': 'Search results for “{q}”', 'search.none': 'Nothing found.',
    'row.popular': 'Popular', 'row.new': 'New releases',
    'discover.unavailable': 'Audible is not responding right now. Please try again later.',

    'status.available': 'Available', 'status.pending': 'Pending approval', 'status.downloading': 'Downloading',
    'status.processing': 'Importing', 'status.not_found': 'Not found', 'status.failed': 'Failed', 'status.declined': 'Declined',

    'book.abridged': 'Abridged', 'book.unabridged': 'Unabridged', 'book.by': 'by', 'book.narratedBy': 'narrated by',
    'book.request': 'Request', 'book.requestAgain': 'Request again', 'book.searching': 'Looking for a matching release…',
    'book.downloadingBtn': 'Downloading', 'book.importingBtn': 'Importing', 'book.pendingBtn': 'Waiting for approval',
    'book.listen': 'Listen in Audiobookshelf', 'book.releases': 'View releases', 'book.description': 'Description',
    'book.releasesTitle': 'Releases on your indexers', 'book.series': 'Series', 'book.seriesBook': 'Book {n}',
    'book.author': 'Author', 'book.narrator': 'Narrator', 'book.length': 'Length', 'book.edition': 'Edition',
    'book.released': 'Released', 'book.publisher': 'Publisher', 'book.rating': 'Rating', 'book.left': '{t} left',
    'book.requestedBy': 'Requested by {name}', 'book.approve': 'Approve', 'book.decline': 'Decline',

    'rel.searching': 'Searching your indexers…', 'rel.none': 'No results on your indexers.', 'rel.download': 'Download',
    'rel.plus.narrator': 'Narrator in name', 'rel.plus.language': 'Language matches', 'rel.plus.unabridged': 'Unabridged',
    'rel.minus.title_mismatch': 'Title does not match', 'rel.minus.wrong_language': 'Different language',
    'rel.minus.drama': 'Dramatization, not a reading', 'rel.minus.abridged': 'Abridged edition',
    'rel.minus.too_small': 'Too small for the length', 'rel.minus.too_large': 'Unusually large',

    'req.title': 'Requests', 'req.empty': 'No requests yet. Pick an audiobook on Discover and request it.',
    'req.requested': 'requested {t}', 'req.by': 'by {name}', 'req.remove': 'Remove from list',
    'req.removeConfirm': 'Remove this request from the list? Files are kept.', 'req.retry': 'Search again',
    'req.filter.all': 'All', 'req.filter.pending': 'Pending', 'req.filter.active': 'In progress',
    'req.filter.available': 'Available', 'req.filter.problems': 'Problems', 'req.filter.mine': 'Mine',

    'users.title': 'Users', 'users.import': 'Import from Audiobookshelf', 'users.imported': '{n} users imported',
    'users.requests': '{n} requests', 'users.lastLogin': 'Last sign-in', 'users.never': 'never',
    'users.role.owner': 'Owner', 'users.role.admin': 'Admin', 'users.role.user': 'User', 'users.disabled': 'Disabled',
    'users.edit': 'Edit user', 'users.role': 'Role', 'users.permissions': 'Permissions', 'users.save': 'Save',
    'users.delete': 'Remove user', 'users.deleteConfirm': 'Remove {name} from Spokarr? Their Audiobookshelf account is not touched.',
    'users.disable': 'Block sign-in', 'users.adminHint': 'Admins have all permissions and can change settings.',
    'users.absType': 'Audiobookshelf: {type}', 'users.empty': 'No users yet.',

    'perm.request': 'Request audiobooks', 'perm.requestHint': 'Can request books.',
    'perm.autoApprove': 'Auto-approve', 'perm.autoApproveHint': 'Requests are downloaded right away without an admin approving them.',
    'perm.manageRequests': 'Manage requests', 'perm.manageRequestsHint': 'Sees all requests, approves or declines them and picks releases by hand.',

    'settings.title': 'Settings', 'settings.general': 'General', 'settings.abs': 'Audiobookshelf',
    'settings.downloads': 'Download client', 'settings.indexers': 'Indexers', 'settings.about': 'About',
    'settings.save': 'Save changes', 'settings.saved': 'Settings saved', 'settings.test': 'Test',
    'settings.testOk': 'Connection works', 'settings.keyStored': 'Stored – leave empty to keep',
    'settings.region': 'Audible store', 'settings.regionHint': 'Catalog, covers and metadata come from this Audible store.',
    'settings.language': 'Book language', 'settings.languageHint': 'Discover rows only show books in this language. Empty = language of the store ({lang}).',
    'settings.rows': 'Discover rows', 'settings.rowsHint': 'Extra rows on the discover page. Keywords are searched on Audible; with a narrator only books read by that person are shown.',
    'settings.rowTitle': 'Title', 'settings.rowKeywords': 'Keywords', 'settings.rowNarrator': 'Narrator (optional)',
    'settings.addRow': 'Add row', 'settings.remove': 'Remove',
    'settings.defaults': 'Permissions for new users', 'settings.defaultsHint': 'Applied when someone signs in for the first time or is imported.',
    'settings.tagRequester': 'Tag books in Audiobookshelf with who requested them', 'settings.tagRequesterHint': 'Adds the tag “Requested by <name>” so everyone can filter their requests in Audiobookshelf.',
    'settings.absUrl': 'Server address', 'settings.absUrlHint': 'As reachable from the Spokarr server.',
    'settings.absPublicUrl': 'Address for browsers', 'settings.absPublicUrlHint': 'Used for “Listen in Audiobookshelf” links.',
    'settings.apiKey': 'API key', 'settings.absKeyHint': 'Created automatically during setup. Otherwise: Audiobookshelf → Settings → API Keys.',
    'settings.library': 'Library', 'settings.libraryHint': 'Book library Spokarr files new audiobooks into. Press “Test” to load the list.',
    'settings.libraryMount': 'Library path in Audiobookshelf', 'settings.libraryMountHint': 'The folder Spokarr writes to ({dir}) as Audiobookshelf sees it.',
    'settings.sabUrl': 'SABnzbd address', 'settings.sabCategory': 'Category',
    'settings.sabCategoryHint': 'Create this category in SABnzbd. Its download folder must be on the same disk as the library.',
    'settings.sabKeyHint': 'SABnzbd → Config → General → API Key.',
    'settings.sabCategoryMissing': 'Category “{cat}” does not exist in SABnzbd yet.',
    'settings.addIndexer': 'Add indexer', 'settings.indexerName': 'Name', 'settings.indexerUrl': 'URL',
    'settings.indexerCategories': 'Categories', 'settings.indexerCategoriesHint': 'Comma separated. 3030 = audiobooks in the Newznab standard.',
    'settings.indexerEnabled': 'Enabled', 'settings.noIndexers': 'No indexer configured yet.',
    'settings.indexerCats': 'Audio categories of this indexer: {cats}',
    'settings.version': 'Version', 'settings.dataDir': 'Library folder (container)', 'settings.source': 'Source code',
    'settings.unsaved': 'You have unsaved changes.',

    'toast.requested': 'Requested – download started', 'toast.pending': 'Requested – waiting for approval',
    'toast.noMatch': 'No matching release found', 'toast.started': 'Download started',
    'toast.approved': 'Approved', 'toast.declined': 'Declined',

    'msg.no_safe_match': '{count} results, but none is a safe match. Pick one under “View releases”.',
    'msg.nothing_found': 'Nothing found on your indexers.', 'msg.paused': 'Paused', 'msg.sab_status': 'SABnzbd: {status}',
    'msg.not_scanned_yet': 'Imported – Audiobookshelf has not picked it up yet.',
    'msg.import_failed': 'Import failed: {error}', 'msg.download_failed': 'Download failed: {error}',

    'err.unauthorized': 'Please sign in.', 'err.forbidden': 'You are not allowed to do that.',
    'err.login_failed': 'Username or password is wrong.', 'err.login_disabled': 'This account is blocked.',
    'err.login_rate_limited': 'Too many attempts. Please wait a few minutes.',
    'err.setup_needs_admin': 'The first sign-in must be an Audiobookshelf administrator.',
    'err.abs_not_configured': 'Audiobookshelf is not configured.', 'err.abs_unreachable': 'Audiobookshelf is not reachable at {url}.',
    'err.abs_not_abs': 'That is not an Audiobookshelf server.', 'err.abs_invalid_url': 'Enter an address starting with http:// or https://.',
    'err.abs_not_initialized': 'Finish the Audiobookshelf setup first.', 'err.abs_bad_key': 'Audiobookshelf rejected the API key.',
    'err.abs_error': 'Audiobookshelf reported an error ({status}).',
    'err.book_not_found': 'Audiobook not found.', 'err.already_requested': 'This audiobook has already been requested.',
    'err.indexer_not_configured': 'No indexer configured.', 'err.indexer_incomplete': 'URL and API key are required.',
    'err.indexer_unreachable': '{name} is not reachable.', 'err.indexer_bad_key': '{name} rejected the API key.',
    'err.indexer_error': '{name}: {status}',
    'err.sab_not_configured': 'SABnzbd is not configured.', 'err.sab_unreachable': 'SABnzbd is not reachable at {url}.',
    'err.sab_bad_key': 'SABnzbd rejected the API key.', 'err.sab_rejected': 'SABnzbd rejected the download.',
    'err.owner_protected': 'The owner cannot be changed or removed.', 'err.self_protected': 'You cannot remove your own admin role.',
    'err.invalid_asin': 'Invalid ASIN.', 'err.invalid_region': 'Unknown Audible store.', 'err.not_found': 'Not found.',
    'err.upstream': 'A connected service did not respond: {message}', 'err.generic': 'Error {code}',

    'time.justNow': 'just now', 'time.minAgo': '{n} min ago', 'time.hAgo': '{n} h ago', 'time.dAgo': '{n} days ago',
    'dur.hm': '{h} h {m} min', 'dur.m': '{m} min', 'footer.data': 'Catalog data from Audible', 'lang.label': 'Language',
    'common.cancel': 'Cancel', 'common.yes': 'Yes', 'common.no': 'No', 'common.loading': 'Loading…',
  },
  de: {
    'nav.discover': 'Entdecken', 'nav.search': 'Suchen', 'nav.requests': 'Anfragen', 'nav.users': 'Benutzer',
    'nav.settings': 'Einstellungen', 'nav.listen': 'Hören', 'nav.more': 'Mehr', 'nav.signOut': 'Abmelden',

    'login.title': 'Anmelden', 'login.subtitle': 'Mit deinem Audiobookshelf-Konto.',
    'login.username': 'Benutzername', 'login.password': 'Passwort', 'login.submit': 'Anmelden',
    'setup.title': 'Willkommen bei Spokarr', 'setup.step1': 'Audiobookshelf verbinden',
    'setup.step1Text': 'Spokarr nutzt die Konten von Audiobookshelf für die Anmeldung und legt fertige Hörbücher in dessen Bibliothek ab.',
    'setup.url': 'Adresse von Audiobookshelf', 'setup.urlHint': 'So, wie der Spokarr-Server sie erreicht, z. B. http://audiobookshelf:80',
    'setup.connect': 'Verbinden', 'setup.step2': 'Als Administrator anmelden',
    'setup.step2Text': 'Der erste Audiobookshelf-Administrator, der sich anmeldet, wird Besitzer von Spokarr. Spokarr legt dann in Audiobookshelf einen eigenen API-Schlüssel an.',
    'setup.change': 'Adresse ändern',

    'search.placeholder': 'Hörbücher, Autoren, Sprecher suchen', 'search.prompt': 'Titel, Autor oder Sprecher eingeben.',
    'search.title': 'Suchergebnisse', 'search.titleFor': 'Suchergebnisse für «{q}»', 'search.none': 'Nichts gefunden.',
    'row.popular': 'Beliebt', 'row.new': 'Neu erschienen',
    'discover.unavailable': 'Audible antwortet gerade nicht. Bitte später erneut versuchen.',

    'status.available': 'Verfügbar', 'status.pending': 'Wartet auf Freigabe', 'status.downloading': 'Lädt',
    'status.processing': 'Wird einsortiert', 'status.not_found': 'Nicht gefunden', 'status.failed': 'Fehler', 'status.declined': 'Abgelehnt',

    'book.abridged': 'Gekürzt', 'book.unabridged': 'Ungekürzt', 'book.by': 'von', 'book.narratedBy': 'gelesen von',
    'book.request': 'Anfragen', 'book.requestAgain': 'Erneut anfragen', 'book.searching': 'Suche passendes Release …',
    'book.downloadingBtn': 'Wird geladen', 'book.importingBtn': 'Wird einsortiert', 'book.pendingBtn': 'Wartet auf Freigabe',
    'book.listen': 'In Audiobookshelf anhören', 'book.releases': 'Releases ansehen', 'book.description': 'Beschreibung',
    'book.releasesTitle': 'Releases bei den Indexern', 'book.series': 'Serie', 'book.seriesBook': 'Band {n}',
    'book.author': 'Autor', 'book.narrator': 'Sprecher', 'book.length': 'Länge', 'book.edition': 'Fassung',
    'book.released': 'Erschienen', 'book.publisher': 'Verlag', 'book.rating': 'Bewertung', 'book.left': 'noch {t}',
    'book.requestedBy': 'Angefragt von {name}', 'book.approve': 'Freigeben', 'book.decline': 'Ablehnen',

    'rel.searching': 'Suche bei den Indexern …', 'rel.none': 'Keine Treffer bei den Indexern.', 'rel.download': 'Laden',
    'rel.plus.narrator': 'Sprecher im Namen', 'rel.plus.language': 'Sprache passt', 'rel.plus.unabridged': 'Ungekürzt',
    'rel.minus.title_mismatch': 'Titel passt nicht', 'rel.minus.wrong_language': 'Andere Sprache',
    'rel.minus.drama': 'Hörspiel statt Lesung', 'rel.minus.abridged': 'Gekürzte Fassung',
    'rel.minus.too_small': 'Zu klein für die Länge', 'rel.minus.too_large': 'Ungewöhnlich gross',

    'req.title': 'Anfragen', 'req.empty': 'Noch keine Anfragen. Auf «Entdecken» ein Hörbuch auswählen und anfragen.',
    'req.requested': 'angefragt {t}', 'req.by': 'von {name}', 'req.remove': 'Aus der Liste entfernen',
    'req.removeConfirm': 'Anfrage aus der Liste entfernen? Die Dateien bleiben erhalten.', 'req.retry': 'Erneut suchen',
    'req.filter.all': 'Alle', 'req.filter.pending': 'Offen', 'req.filter.active': 'In Arbeit',
    'req.filter.available': 'Verfügbar', 'req.filter.problems': 'Probleme', 'req.filter.mine': 'Meine',

    'users.title': 'Benutzer', 'users.import': 'Aus Audiobookshelf importieren', 'users.imported': '{n} Benutzer importiert',
    'users.requests': '{n} Anfragen', 'users.lastLogin': 'Letzte Anmeldung', 'users.never': 'nie',
    'users.role.owner': 'Besitzer', 'users.role.admin': 'Admin', 'users.role.user': 'Benutzer', 'users.disabled': 'Gesperrt',
    'users.edit': 'Benutzer bearbeiten', 'users.role': 'Rolle', 'users.permissions': 'Rechte', 'users.save': 'Speichern',
    'users.delete': 'Benutzer entfernen', 'users.deleteConfirm': '{name} aus Spokarr entfernen? Das Audiobookshelf-Konto bleibt unverändert.',
    'users.disable': 'Anmeldung sperren', 'users.adminHint': 'Admins haben alle Rechte und können die Einstellungen ändern.',
    'users.absType': 'Audiobookshelf: {type}', 'users.empty': 'Noch keine Benutzer.',

    'perm.request': 'Hörbücher anfragen', 'perm.requestHint': 'Darf Hörbücher anfragen.',
    'perm.autoApprove': 'Automatisch freigeben', 'perm.autoApproveHint': 'Anfragen werden sofort geladen, ohne dass ein Admin sie freigibt.',
    'perm.manageRequests': 'Anfragen verwalten', 'perm.manageRequestsHint': 'Sieht alle Anfragen, gibt sie frei oder lehnt sie ab und wählt Releases von Hand.',

    'settings.title': 'Einstellungen', 'settings.general': 'Allgemein', 'settings.abs': 'Audiobookshelf',
    'settings.downloads': 'Download-Client', 'settings.indexers': 'Indexer', 'settings.about': 'Über',
    'settings.save': 'Änderungen speichern', 'settings.saved': 'Einstellungen gespeichert', 'settings.test': 'Testen',
    'settings.testOk': 'Verbindung funktioniert', 'settings.keyStored': 'Gespeichert – leer lassen zum Behalten',
    'settings.region': 'Audible-Shop', 'settings.regionHint': 'Katalog, Cover und Metadaten kommen aus diesem Audible-Shop.',
    'settings.language': 'Sprache der Bücher', 'settings.languageHint': 'Die Reihen auf «Entdecken» zeigen nur Bücher in dieser Sprache. Leer = Sprache des Shops ({lang}).',
    'settings.rows': 'Reihen auf «Entdecken»', 'settings.rowsHint': 'Zusätzliche Reihen auf der Startseite. Die Stichwörter werden bei Audible gesucht; mit Sprecher erscheinen nur Bücher, die diese Person liest.',
    'settings.rowTitle': 'Titel', 'settings.rowKeywords': 'Stichwörter', 'settings.rowNarrator': 'Sprecher (optional)',
    'settings.addRow': 'Reihe hinzufügen', 'settings.remove': 'Entfernen',
    'settings.defaults': 'Rechte für neue Benutzer', 'settings.defaultsHint': 'Gilt, wenn sich jemand zum ersten Mal anmeldet oder importiert wird.',
    'settings.tagRequester': 'Hörbücher in Audiobookshelf mit dem Anfragenden markieren', 'settings.tagRequesterHint': 'Setzt das Tag «Requested by <Name>», damit jede Person ihre Anfragen in Audiobookshelf filtern kann.',
    'settings.absUrl': 'Serveradresse', 'settings.absUrlHint': 'So, wie der Spokarr-Server sie erreicht.',
    'settings.absPublicUrl': 'Adresse für Browser', 'settings.absPublicUrlHint': 'Für die Links «In Audiobookshelf anhören».',
    'settings.apiKey': 'API-Schlüssel', 'settings.absKeyHint': 'Wird bei der Einrichtung automatisch angelegt. Sonst: Audiobookshelf → Einstellungen → API-Schlüssel.',
    'settings.library': 'Bibliothek', 'settings.libraryHint': 'Hörbuch-Bibliothek, in die Spokarr neue Hörbücher legt. «Testen» lädt die Liste.',
    'settings.libraryMount': 'Bibliothekspfad in Audiobookshelf', 'settings.libraryMountHint': 'Der Ordner, in den Spokarr schreibt ({dir}), so wie Audiobookshelf ihn sieht.',
    'settings.sabUrl': 'Adresse von SABnzbd', 'settings.sabCategory': 'Kategorie',
    'settings.sabCategoryHint': 'Diese Kategorie in SABnzbd anlegen. Ihr Download-Ordner muss auf derselben Platte liegen wie die Bibliothek.',
    'settings.sabKeyHint': 'SABnzbd → Config → General → API Key.',
    'settings.sabCategoryMissing': 'Die Kategorie «{cat}» gibt es in SABnzbd noch nicht.',
    'settings.addIndexer': 'Indexer hinzufügen', 'settings.indexerName': 'Name', 'settings.indexerUrl': 'URL',
    'settings.indexerCategories': 'Kategorien', 'settings.indexerCategoriesHint': 'Mit Komma getrennt. 3030 = Hörbücher im Newznab-Standard.',
    'settings.indexerEnabled': 'Aktiv', 'settings.noIndexers': 'Noch kein Indexer eingerichtet.',
    'settings.indexerCats': 'Audio-Kategorien dieses Indexers: {cats}',
    'settings.version': 'Version', 'settings.dataDir': 'Bibliotheksordner (Container)', 'settings.source': 'Quellcode',
    'settings.unsaved': 'Es gibt ungespeicherte Änderungen.',

    'toast.requested': 'Angefragt – Download läuft', 'toast.pending': 'Angefragt – wartet auf Freigabe',
    'toast.noMatch': 'Kein passendes Release gefunden', 'toast.started': 'Download gestartet',
    'toast.approved': 'Freigegeben', 'toast.declined': 'Abgelehnt',

    'msg.no_safe_match': '{count} Treffer, aber keiner passt sicher. Unter «Releases ansehen» selbst wählen.',
    'msg.nothing_found': 'Bei den Indexern nichts gefunden.', 'msg.paused': 'Pausiert', 'msg.sab_status': 'SABnzbd: {status}',
    'msg.not_scanned_yet': 'Abgelegt – Audiobookshelf hat es noch nicht eingelesen.',
    'msg.import_failed': 'Einsortieren fehlgeschlagen: {error}', 'msg.download_failed': 'Download fehlgeschlagen: {error}',

    'err.unauthorized': 'Bitte anmelden.', 'err.forbidden': 'Dafür fehlt dir die Berechtigung.',
    'err.login_failed': 'Benutzername oder Passwort ist falsch.', 'err.login_disabled': 'Dieses Konto ist gesperrt.',
    'err.login_rate_limited': 'Zu viele Versuche. Bitte ein paar Minuten warten.',
    'err.setup_needs_admin': 'Die erste Anmeldung muss ein Audiobookshelf-Administrator sein.',
    'err.abs_not_configured': 'Audiobookshelf ist nicht eingerichtet.', 'err.abs_unreachable': 'Audiobookshelf ist unter {url} nicht erreichbar.',
    'err.abs_not_abs': 'Das ist kein Audiobookshelf-Server.', 'err.abs_invalid_url': 'Bitte eine Adresse mit http:// oder https:// eingeben.',
    'err.abs_not_initialized': 'Bitte zuerst die Einrichtung von Audiobookshelf abschliessen.', 'err.abs_bad_key': 'Audiobookshelf hat den API-Schlüssel abgelehnt.',
    'err.abs_error': 'Audiobookshelf meldet einen Fehler ({status}).',
    'err.book_not_found': 'Hörbuch nicht gefunden.', 'err.already_requested': 'Dieses Hörbuch wurde schon angefragt.',
    'err.indexer_not_configured': 'Kein Indexer eingerichtet.', 'err.indexer_incomplete': 'URL und API-Schlüssel sind nötig.',
    'err.indexer_unreachable': '{name} ist nicht erreichbar.', 'err.indexer_bad_key': '{name} hat den API-Schlüssel abgelehnt.',
    'err.indexer_error': '{name}: {status}',
    'err.sab_not_configured': 'SABnzbd ist nicht eingerichtet.', 'err.sab_unreachable': 'SABnzbd ist unter {url} nicht erreichbar.',
    'err.sab_bad_key': 'SABnzbd hat den API-Schlüssel abgelehnt.', 'err.sab_rejected': 'SABnzbd hat den Download abgelehnt.',
    'err.owner_protected': 'Der Besitzer kann nicht geändert oder entfernt werden.', 'err.self_protected': 'Die eigene Admin-Rolle lässt sich nicht entfernen.',
    'err.invalid_asin': 'Ungültige ASIN.', 'err.invalid_region': 'Unbekannter Audible-Shop.', 'err.not_found': 'Nicht gefunden.',
    'err.upstream': 'Ein verbundener Dienst antwortet nicht: {message}', 'err.generic': 'Fehler {code}',

    'time.justNow': 'gerade eben', 'time.minAgo': 'vor {n} Min.', 'time.hAgo': 'vor {n} Std.', 'time.dAgo': 'vor {n} Tagen',
    'dur.hm': '{h} Std. {m} Min.', 'dur.m': '{m} Min.', 'footer.data': 'Katalogdaten von Audible', 'lang.label': 'Sprache',
    'common.cancel': 'Abbrechen', 'common.yes': 'Ja', 'common.no': 'Nein', 'common.loading': 'Lädt …',
  },
};

const STORAGE_KEY = 'spokarr.lang';
function detect() {
  try { const saved = localStorage.getItem(STORAGE_KEY); if (saved && dict[saved]) return saved; } catch { /* storage blocked */ }
  for (const l of navigator.languages || [navigator.language]) {
    const short = String(l || '').slice(0, 2).toLowerCase();
    if (dict[short]) return short;
  }
  return 'en';
}
export let lang = detect();
export const locale = () => (lang === 'de' ? 'de-CH' : 'en-US');
export function setLang(l) {
  if (!dict[l]) return;
  lang = l;
  try { localStorage.setItem(STORAGE_KEY, l); } catch { /* storage blocked */ }
  document.documentElement.lang = l;
}
export function t(key, params = {}) {
  const s = dict[lang]?.[key] ?? dict.en[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (params[k] ?? ''));
}
document.documentElement.lang = lang;
