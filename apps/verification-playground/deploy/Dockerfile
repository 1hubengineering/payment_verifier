# syntax=docker/dockerfile:1
FROM node:26.13.1-bookworm@sha256:b7087bc4d973034b30854b378ba107f9fab622b47514cb7e2592e41b8bab8d49 AS build
WORKDIR /workspace
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN --mount=type=cache,target=/root/.npm npm install --global --allow-scripts=pnpm pnpm@12.21.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .node-version ./
COPY apps/verification-playground/package.json apps/verification-playground/
COPY apps/verification-benchmarks/package.json apps/verification-benchmarks/
COPY packages/verifier/package.json packages/verifier/
COPY packages/provider-cbe/package.json packages/provider-cbe/
COPY packages/storage-sql/package.json packages/storage-sql/
RUN --mount=type=cache,target=/pnpm/store pnpm install --frozen-lockfile --store-dir /pnpm/store
COPY tsconfig.json vite.config.ts ./
COPY packages/verifier packages/verifier
COPY packages/provider-cbe packages/provider-cbe
COPY packages/storage-sql packages/storage-sql
COPY apps/verification-playground apps/verification-playground
COPY apps/verification-benchmarks apps/verification-benchmarks
RUN pnpm --filter './packages/*' build \
    && pnpm --filter @1hubengineering/verification-benchmarks build \
    && pnpm --filter @1hubengineering/verification-playground check:env \
    && pnpm --filter @1hubengineering/verification-playground build
RUN --mount=type=cache,target=/pnpm/store pnpm --filter @1hubengineering/verification-playground deploy --prod --store-dir /pnpm/store /opt/playground

FROM node:26.13.1-bookworm-slim@sha256:5df79989ed685e09f0a98019db4cebfb22fb9df1a53c0161664a011f7ff6b0f1 AS standard
WORKDIR /opt/playground
LABEL org.opencontainers.image.source="https://github.com/1hubengineering/payment_verifier"
# Use injected container secrets without selecting a host TPM helper.
ENV NODE_ENV=production \
    _VARLOCK_FORCE_FILE_ENCRYPTION_FALLBACK=1 \
    PLAYGROUND_DATA_DIR=/data
COPY --from=build --link /opt/playground /opt/playground
RUN install -d -o node -g node -m 0700 /data
USER node
EXPOSE 4080
CMD ["./node_modules/.bin/varlock", "run", "--", "node", "src/server/main.ts"]

FROM mcr.microsoft.com/playwright:v1.65.1-noble@sha256:1507cbfc550a63a6b7396791ca4f00df17beb56342d2447b3f106c306f525579 AS chromium
WORKDIR /opt/playground
LABEL org.opencontainers.image.source="https://github.com/1hubengineering/payment_verifier"
# Container secrets arrive as environment variables. Keep Varlock from choosing
# a host-specific native encryption helper under Docker Desktop kernels.
ENV NODE_ENV=production \
    _VARLOCK_FORCE_FILE_ENCRYPTION_FALLBACK=1 \
    PLAYGROUND_DATA_DIR=/data
COPY --from=build --link /usr/local/bin/node /usr/local/bin/node
COPY --from=build --link /opt/playground /opt/playground
RUN install -d -o pwuser -g pwuser -m 0700 /data
USER pwuser
EXPOSE 4080
CMD ["./node_modules/.bin/varlock", "run", "--", "node", "src/server/main.ts"]
