import { Body, Controller, Delete, HttpCode, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AbilityGuard } from '../casl/ability.guard';
import { CheckAbility } from '../casl/check-ability.decorator';
import { AppAbility } from '../casl/casl-ability.factory';
import { CoursesService } from './courses.service';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';

type AbilityRequest = { ability: AppAbility };

// Lessons, like modules, carry no org_id — scoping is enforced by resolving
// module -> course -> ability inside CoursesService.
@Controller('modules/:moduleId/lessons')
@UseGuards(JwtAuthGuard, AbilityGuard)
export class LessonsController {
  constructor(private readonly courses: CoursesService) {}

  @Post()
  @CheckAbility('update', 'Course')
  create(@Req() req: AbilityRequest, @Param('moduleId') moduleId: string, @Body() dto: CreateLessonDto) {
    return this.courses.createLesson(req.ability, moduleId, dto);
  }

  @Patch(':lessonId')
  @CheckAbility('update', 'Course')
  update(
    @Req() req: AbilityRequest,
    @Param('moduleId') moduleId: string,
    @Param('lessonId') lessonId: string,
    @Body() dto: UpdateLessonDto,
  ) {
    return this.courses.updateLesson(req.ability, moduleId, lessonId, dto);
  }

  @Delete(':lessonId')
  @HttpCode(204)
  @CheckAbility('update', 'Course')
  remove(
    @Req() req: AbilityRequest,
    @Param('moduleId') moduleId: string,
    @Param('lessonId') lessonId: string,
  ) {
    return this.courses.removeLesson(req.ability, moduleId, lessonId);
  }
}
