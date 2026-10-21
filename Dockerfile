# syntax=docker/dockerfile:1
ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-bookworm AS node-runtime

FROM ubuntu:24.04 AS base
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git tini \
    && rm -rf /var/lib/apt/lists/*
COPY --from=node-runtime /usr/local/ /usr/local/
RUN useradd --create-home --uid 10001 academy \
    && mkdir -p /opt/agent-academy \
    && chown academy:academy /opt/agent-academy
ENV LANG=C.UTF-8
WORKDIR /opt/agent-academy
USER academy

# docker build --target check . runs acceptance on actual Ubuntu userspace.
FROM base AS check
USER root
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends python3 \
    && rm -rf /var/lib/apt/lists/*
USER academy
COPY --chown=academy:academy . .
RUN npm ci --include=dev --no-audit --no-fund \
    && npm run check \
    && NODE_ENV=production npm_config_omit=dev ./scripts/install.sh --build-only \
    && ./scripts/install.sh --check \
    && ./scripts/academy.sh --verify-install \
    && node scripts/smoke-provider.mjs \
    && npm run smoke:terminal

FROM base AS runtime
ENV NODE_ENV=production
COPY --chown=academy:academy . .
RUN ./scripts/install.sh --build-only \
    && npm prune --omit=dev --ignore-scripts --no-audit --no-fund \
    && ./scripts/academy.sh --verify-install \
    && npm cache clean --force
ENTRYPOINT ["/usr/bin/tini", "--", "/opt/agent-academy/scripts/academy.sh"]
CMD ["--demo", "--headless"]
