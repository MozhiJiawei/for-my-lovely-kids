ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE}

WORKDIR /app

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ARG NPM_REGISTRY=https://registry.npmjs.org/

RUN npm config set registry "$NPM_REGISTRY" \
  && corepack enable \
  && corepack prepare pnpm@10.10.0 --activate

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl sqlite3 \
  && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY scripts ./scripts
COPY prisma ./prisma
COPY apps/api/package.json ./apps/api/package.json
COPY apps/miniprogram/package.json ./apps/miniprogram/package.json
COPY packages/domain/package.json ./packages/domain/package.json

RUN pnpm install --frozen-lockfile

COPY apps/api ./apps/api
COPY packages/domain ./packages/domain

RUN pnpm exec prisma generate

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["pnpm", "--filter", "@red-flower-garden/api", "exec", "tsx", "src/server.ts"]
