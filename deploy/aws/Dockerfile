FROM node:24-bookworm-slim

WORKDIR /app
COPY --chown=node:node server ./server
COPY --chown=node:node shared ./shared

RUN mkdir -p /data && chown node:node /data

ENV NODE_ENV=production
ENV PORT=8787
ENV DATA_DIR=/data

USER node
EXPOSE 8787

CMD ["node", "server/index.mjs"]
