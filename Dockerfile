FROM node:22-alpine
LABEL org.opencontainers.image.title="Spokarr" \
      org.opencontainers.image.description="Request and download audiobooks for your Audiobookshelf library" \
      org.opencontainers.image.licenses="MIT"
WORKDIR /app
COPY package.json server.mjs ./
COPY public ./public
ENV NODE_ENV=production PORT=5057 DATA_DIR=/data LIBRARY_DIR=/audiobooks
EXPOSE 5057
HEALTHCHECK --interval=60s --timeout=5s CMD wget -qO- http://127.0.0.1:${PORT}/api/health >/dev/null || exit 1
USER node
CMD ["node", "server.mjs"]
