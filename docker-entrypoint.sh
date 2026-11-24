#!/bin/sh
# Starts Spokarr as PUID:PGID (default 1000:1000), like linuxserver.io images.
# Docker creates missing bind-mount folders as root – fix the data folder, then drop root.
set -e
PUID="${PUID:-1000}"
PGID="${PGID:-1000}"
if [ "$(id -u)" = "0" ]; then
  mkdir -p "${DATA_DIR:-/data}"
  chown "$PUID:$PGID" "${DATA_DIR:-/data}"
  chown "$PUID:$PGID" "${DATA_DIR:-/data}"/*.json 2>/dev/null || true
  exec su-exec "$PUID:$PGID" "$@"
fi
# started with --user: run as that user
exec "$@"
