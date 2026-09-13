# schultask-backend

NestJS API for Schultask (corporate L&D platform). Deployed as a container — see [schultask-deployment](https://github.com/abdulaziz-bd/schultask-deployment) for the data layer (Postgres/Redis/MinIO) and reverse proxy this runs alongside.

## Prerequisites

- Node.js 22+
- npm
- A running Postgres, Redis, and MinIO (see `schultask-deployment`'s dev compose, or run your own)

## Local development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy the env file and fill in real values:
   ```bash
   cp .env.example .env
   ```
3. Run migrations and seed the system roles (`admin`/`manager`/`learner`) — required once per fresh database:
   ```bash
   npm run prisma:migrate
   npm run prisma:seed
   ```
4. Start the dev server:
   ```bash
   npm run dev
   ```
   Health check: `curl http://localhost:3001/health`

## Building the container image

```bash
docker build -t ghcr.io/abdulaziz-bd/schultask-backend:latest .
```

Pushed automatically to GHCR by `.github/workflows/docker-publish.yml` on every push to `main`.

## Database migrations

Migrations are committed to `prisma/migrations/` — never hand-edit the database. The container's `CMD` runs `prisma migrate deploy` automatically on every boot, so deploying a new image with new migrations is enough; seeding is a one-time bootstrap and is not run automatically (`npm run prisma:seed` against the target database, once).
