FROM node:22-alpine
LABEL org.opencontainers.image.title="Spokarr" \
      org.opencontainers.image.description="Request and download audiobooks for your Audiobookshelf library" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.source="https://github.com/BlugDeg/Spokarr"
RUN apk add --no-cache su-exec
WORKDIR /app
COPY package.json server.mjs docker-entrypoint.sh ./
COPY src ./src
COPY public ./public
ENV NODE_ENV=production PORT=5057 DATA_DIR=/data LIBRARY_DIR=/audiobooks PUID=1000 PGID=1000
EXPOSE 5057
HEALTHCHECK --interval=60s --timeout=5s CMD wget -qO- http://127.0.0.1:${PORT}/api/health >/dev/null || exit 1
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "server.mjs"]
