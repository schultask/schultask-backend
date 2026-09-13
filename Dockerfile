FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules node_modules
COPY . .
# prisma generate only needs the schema to be syntactically valid, never a
# live connection — this placeholder satisfies env("DATABASE_URL") so the
# client generates for the container's (linux) target regardless of host arch.
ENV DATABASE_URL="postgresql://user:pass@localhost:5432/db"
RUN npx prisma generate
RUN npm run build
RUN npm ci --omit=dev

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/dist dist
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/package.json package.json
COPY --from=build /app/prisma prisma
COPY --from=build /app/prisma.config.ts prisma.config.ts
EXPOSE 3001
# Applies any pending migrations before every boot — idempotent, and keeps
# "migrations are the only way the schema changes" true in production too.
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node dist/main.js"]
