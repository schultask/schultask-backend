import { Module } from '@nestjs/common';
import { CaslModule } from '../casl/casl.module';
import { CoursesController } from './courses.controller';
import { ModulesController } from './modules.controller';
import { LessonsController } from './lessons.controller';
import { CoursesService } from './courses.service';

@Module({
  imports: [CaslModule],
  controllers: [CoursesController, ModulesController, LessonsController],
  providers: [CoursesService],
  exports: [CoursesService],
})
export class CoursesModule {}
