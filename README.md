# schultask-backend

NestJS API for Schultask, a corporate L&D platform. See [schultask-deployment](https://github.com/schultask/schultask-deployment) for the data layer (Postgres/Redis/MinIO) it needs.

## Prerequisites

- Node.js 22+
- Postgres, Redis, and MinIO (see `schultask-deployment`'s dev compose, or run your own)

## Getting started

```bash
npm install
cp .env.example .env
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

Health check: `curl http://localhost:3001/health`

## License

MIT
