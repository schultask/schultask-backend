import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { StorageModule } from './storage/storage.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CoursesModule } from './courses/courses.module';
import { AssignmentsModule } from './assignments/assignments.module';
import { EventsModule } from './events/events.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AiModule } from './ai/ai.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Registers Nest's cron scheduler globally — without this,
    // RollupService's @Cron() decorator is inert metadata that never
    // actually fires (it only looks like it's wired up).
    ScheduleModule.forRoot(),
    // A connection BullMQ owns and configures itself (it requires
    // maxRetriesPerRequest: null, which would conflict with RedisModule's
    // ioredis instance used for refresh-token storage) — two independent
    // Redis connections, not a shared one.
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: { url: config.get<string>('REDIS_URL', 'redis://localhost:6379') },
      }),
    }),
    PrismaModule,
    RedisModule,
    StorageModule,
    AuthModule,
    UsersModule,
    CoursesModule,
    AssignmentsModule,
    EventsModule,
    AnalyticsModule,
    AiModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
