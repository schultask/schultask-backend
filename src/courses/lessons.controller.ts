import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AbilityGuard } from '../casl/ability.guard';
import { CheckAbility } from '../casl/check-ability.decorator';
import { AppAbility } from '../casl/casl-ability.factory';
import { CoursesService } from './courses.service';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';

type AbilityRequest = { ability: AppAbility };

// A blob-fetch-and-object-URL player (see the frontend's ProtectedMedia
// component) downloads the whole file before anything renders — 25MB keeps
// that from being a multi-minute wait on a real connection, and keeps
// multer's in-memory buffering (no disk storage configured) from being a
// real memory risk per concurrent upload. True progressive/ranged video
// streaming is a bigger piece of work, deliberately deferred — see
// PROGRESS.md's Phase 12 notes.
const MAX_LESSON_MEDIA_BYTES = 25 * 1024 * 1024;

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

  @Post(':lessonId/content')
  @CheckAbility('update', 'Course')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_LESSON_MEDIA_BYTES } }))
  setContent(
    @Req() req: AbilityRequest,
    @Param('moduleId') moduleId: string,
    @Param('lessonId') lessonId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.courses.setLessonContent(req.ability, moduleId, lessonId, file);
  }

  // Builder-preview path only, gated the same as every other course:read
  // route in this controller — see CoursesService.getLessonContentStream
  // for why the learner-facing player uses a different, enrollment-scoped
  // route instead of this one.
  @Get(':lessonId/content')
  @CheckAbility('read', 'Course')
  async getContent(
    @Req() req: AbilityRequest,
    @Param('moduleId') moduleId: string,
    @Param('lessonId') lessonId: string,
    @Res() res: Response,
  ) {
    const { stream, contentType } = await this.courses.getLessonContentStream(req.ability, moduleId, lessonId);
    res.type(contentType);
    stream.pipe(res);
  }
}
