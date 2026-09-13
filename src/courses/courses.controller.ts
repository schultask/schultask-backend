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
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { CoursesService } from './courses.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';

const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024;

type AbilityRequest = { ability: AppAbility };

@Controller('courses')
@UseGuards(JwtAuthGuard, AbilityGuard)
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Post()
  @CheckAbility('create', 'Course')
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateCourseDto) {
    return this.courses.create(user.orgId, user.id, dto);
  }

  @Get()
  @CheckAbility('read', 'Course')
  findAll(@Req() req: AbilityRequest) {
    return this.courses.findAll(req.ability);
  }

  @Get(':id')
  @CheckAbility('read', 'Course')
  findOne(@Req() req: AbilityRequest, @Param('id') id: string) {
    return this.courses.findOne(req.ability, id);
  }

  @Patch(':id')
  @CheckAbility('update', 'Course')
  update(@Req() req: AbilityRequest, @Param('id') id: string, @Body() dto: UpdateCourseDto) {
    return this.courses.update(req.ability, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @CheckAbility('delete', 'Course')
  remove(@Req() req: AbilityRequest, @Param('id') id: string) {
    return this.courses.remove(req.ability, id);
  }

  @Post(':id/publish')
  @CheckAbility('publish', 'Course')
  publish(@Req() req: AbilityRequest, @Param('id') id: string) {
    return this.courses.publish(req.ability, id);
  }

  @Post(':id/thumbnail')
  @CheckAbility('update', 'Course')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_THUMBNAIL_BYTES },
      fileFilter: (_req, file, callback) => {
        if (!file.mimetype.startsWith('image/')) {
          callback(new BadRequestException('Thumbnail must be an image'), false);
          return;
        }
        callback(null, true);
      },
    }),
  )
  setThumbnail(
    @Req() req: AbilityRequest,
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.courses.setThumbnail(req.ability, id, file);
  }

  // Proxied through the backend rather than a MinIO presigned URL — MinIO
  // stays internal-only (section 3), consistent with "the backend is the
  // only thing allowed to talk to the data layer."
  @Get(':id/thumbnail')
  @CheckAbility('read', 'Course')
  async getThumbnail(@Req() req: AbilityRequest, @Param('id') id: string, @Res() res: Response) {
    const { stream, contentType } = await this.courses.getThumbnailStream(req.ability, id);
    res.type(contentType);
    stream.pipe(res);
  }
}
