import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  // Access tokens travel via the Authorization header, not a cookie, so
  // `credentials: true` isn't needed here — but the origin allowlist still
  // matters once a real frontend exists (default covers local dev only).
  app.enableCors({ origin: config.get<string>('FRONTEND_ORIGIN', 'http://localhost:3000') });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
