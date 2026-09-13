import { Module } from '@nestjs/common';
import { CaslModule } from '../casl/casl.module';
import { CoursesModule } from '../courses/courses.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { RollupService } from './rollup.service';

@Module({
  imports: [CaslModule, CoursesModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, RollupService],
})
export class AnalyticsModule {}
