FROM node:20-alpine AS base
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
FROM base AS runner
ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "start"]
