import { Body, Controller, Get, Param, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AbilityGuard } from '../casl/ability.guard';
import { CheckAbility } from '../casl/check-ability.decorator';
import { AppAbility } from '../casl/casl-ability.factory';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { AssignmentsService } from './assignments.service';
import { UpdateProgressDto } from './dto/update-progress.dto';
import { SubmitQuizDto } from './dto/submit-quiz.dto';

type AbilityRequest = { ability: AppAbility };

@Controller()
@UseGuards(JwtAuthGuard, AbilityGuard)
export class EnrollmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  // Self-scoped by ownership, same as /assignments/me — no CASL check,
  // since Enrollment carries no org_id to condition on and a learner's own
  // enrollments are always theirs to read.
  @Get('enrollments/me')
  findMine(@CurrentUser() user: CurrentUserPayload) {
    return this.assignments.findMyEnrollments(user.id);
  }

  @Patch('enrollments/:id/progress')
  updateProgress(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateProgressDto,
  ) {
    return this.assignments.updateMyProgress(user.id, id, dto);
  }

  // The course player's data source — course + modules + lessons, reached
  // only through the requester's own enrollment. See
  // AssignmentsService.findEnrollmentCourse for why this isn't just
  // GET /courses/:id.
  @Get('enrollments/:id/course')
  getCourse(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.assignments.findEnrollmentCourse(user.id, id);
  }

  // Media for an image/video lesson — see
  // AssignmentsService.getLessonContentForEnrollment for why this is a
  // separate route from the admin builder's module-scoped one.
  @Get('enrollments/:id/lessons/:lessonId/content')
  async getLessonContent(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Param('lessonId') lessonId: string,
    @Res() res: Response,
  ) {
    const { stream, contentType } = await this.assignments.getLessonContentForEnrollment(user.id, id, lessonId);
    res.type(contentType);
    stream.pipe(res);
  }

  // Scoring stays server-side (see AssignmentsService.submitQuiz) so the answer
  // key is never present in a response the learner's browser can inspect.
  @Post('enrollments/:id/lessons/:lessonId/quiz-submit')
  submitQuiz(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Param('lessonId') lessonId: string,
    @Body() dto: SubmitQuizDto,
  ) {
    return this.assignments.submitQuiz(user.id, user.orgId, id, lessonId, dto);
  }

  // Manager/admin view of a course's enrollments — scoped by resolving the
  // course through CASL (see AssignmentsService.findEnrollmentsForCourse).
  @Get('courses/:courseId/enrollments')
  @CheckAbility('read', 'Course')
  findForCourse(@Req() req: AbilityRequest, @Param('courseId') courseId: string) {
    return this.assignments.findEnrollmentsForCourse(req.ability, courseId);
  }
}
