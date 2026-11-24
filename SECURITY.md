# Security policy

## Supported versions

Only the latest release receives security fixes. Please update to `ghcr.io/blugdeg/spokarr:latest`
before reporting.

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Use GitHub's private reporting instead:
**Security → Report a vulnerability** in this repository
(https://github.com/BlugDeg/Spokarr/security/advisories/new).

Include the version, how to reproduce it and what an attacker could do. You will get an answer within
a few days. Once a fix is released, the advisory is published and you are credited if you wish.

## How Spokarr handles secrets

- User passwords are checked by Audiobookshelf and never stored.
- Sessions are random tokens in an `HttpOnly`, `SameSite=Lax` cookie; only their SHA-256 hashes are
  saved.
- API keys, passwords and webhook URLs of connected services are stored in `data/settings.json`
  (file mode `600`) and are never sent to the browser.
- Failed sign-ins are rate-limited per IP.

Spokarr has no built-in HTTPS. If you expose it to the internet, put it behind a reverse proxy with
TLS.
