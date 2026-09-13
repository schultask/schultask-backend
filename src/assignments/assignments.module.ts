import { Module } from '@nestjs/common';
import { CaslModule } from '../casl/casl.module';
import { CoursesModule } from '../courses/courses.module';
import { AssignmentsController } from './assignments.controller';
import { EnrollmentsController } from './enrollments.controller';
import { AssignmentsService } from './assignments.service';

@Module({
  imports: [CaslModule, CoursesModule],
  controllers: [AssignmentsController, EnrollmentsController],
  providers: [AssignmentsService],
})
export class AssignmentsModule {}
