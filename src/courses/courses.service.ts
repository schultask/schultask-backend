import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { accessibleBy } from '@casl/prisma';
import { CourseStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AppAbility } from '../casl/casl-ability.factory';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { CreateModuleDto } from './dto/create-module.dto';
import { UpdateModuleDto } from './dto/update-module.dto';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';

export type CourseAction = 'read' | 'update' | 'delete' | 'publish';

@Injectable()
export class CoursesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // Every course-scoped route (course itself, or a module/lesson/assignment
  // reached through it) goes through this: the guard only checks the *type*
  // of ability ("can this user read/update *a* Course"), not the specific
  // row, so resolving the instance here is what turns cross-org access into
  // a 404 instead of a leak. See PROGRESS.md's Phase 3 hardening notes.
  // Public: AssignmentsService reuses it rather than duplicating the check.
  async findCourseOrThrow(ability: AppAbility, id: string, action: CourseAction) {
    const course = await this.prisma.course.findFirst({
      where: { AND: [{ id }, accessibleBy(ability, action).Course] },
    });
    if (!course) throw new NotFoundException('Course not found');
    return course;
  }

  async create(orgId: string, userId: string, dto: CreateCourseDto) {
    return this.prisma.course.create({
      data: { orgId, createdBy: userId, title: dto.title, description: dto.description },
    });
  }

  async findAll(ability: AppAbility) {
    return this.prisma.course.findMany({
      where: accessibleBy(ability, 'read').Course,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(ability: AppAbility, id: string) {
    const course = await this.findCourseOrThrow(ability, id, 'read');
    const modules = await this.prisma.module.findMany({
      where: { courseId: course.id },
      orderBy: { sortOrder: 'asc' },
      include: { lessons: { orderBy: { sortOrder: 'asc' } } },
    });
    return { ...course, modules };
  }

  async update(ability: AppAbility, id: string, dto: UpdateCourseDto) {
    await this.findCourseOrThrow(ability, id, 'update');
    return this.prisma.course.update({ where: { id }, data: dto });
  }

  async remove(ability: AppAbility, id: string) {
    const course = await this.findCourseOrThrow(ability, id, 'delete');
    if (course.thumbnailKey) await this.storage.deleteObject(course.thumbnailKey);
    await this.prisma.course.delete({ where: { id } });
  }

  async publish(ability: AppAbility, id: string) {
    await this.findCourseOrThrow(ability, id, 'publish');
    return this.prisma.course.update({ where: { id }, data: { status: CourseStatus.published } });
  }

  async setThumbnail(ability: AppAbility, id: string, file: Express.Multer.File) {
    const course = await this.findCourseOrThrow(ability, id, 'update');
    const oldKey = course.thumbnailKey;
    const key = `courses/${id}/${randomUUID()}-${file.originalname}`;
    await this.storage.putObject(key, file.buffer, file.mimetype);
    // Delete the old object only after the DB row points at the new one —
    // if the update below failed first, the DB would reference a key that
    // no longer exists in MinIO.
    const updated = await this.prisma.course.update({ where: { id }, data: { thumbnailKey: key } });
    if (oldKey) await this.storage.deleteObject(oldKey);
    return updated;
  }

  async getThumbnailStream(ability: AppAbility, id: string) {
    const course = await this.findCourseOrThrow(ability, id, 'read');
    if (!course.thumbnailKey) throw new NotFoundException('Course has no thumbnail');
    const [stream, contentType] = await Promise.all([
      this.storage.getObjectStream(course.thumbnailKey),
      this.storage.getContentType(course.thumbnailKey),
    ]);
    return { stream, contentType };
  }

  // --- Modules (scoped by resolving the parent course's ability first —
  // modules carry no org_id of their own, see schema.prisma) ---

  async createModule(ability: AppAbility, courseId: string, dto: CreateModuleDto) {
    await this.findCourseOrThrow(ability, courseId, 'update');
    return this.prisma.module.create({
      data: { courseId, title: dto.title, sortOrder: dto.sortOrder ?? 0 },
    });
  }

  async updateModule(ability: AppAbility, courseId: string, moduleId: string, dto: UpdateModuleDto) {
    await this.findCourseOrThrow(ability, courseId, 'update');
    const module = await this.prisma.module.findFirst({ where: { id: moduleId, courseId } });
    if (!module) throw new NotFoundException('Module not found');
    return this.prisma.module.update({ where: { id: moduleId }, data: dto });
  }

  async removeModule(ability: AppAbility, courseId: string, moduleId: string) {
    await this.findCourseOrThrow(ability, courseId, 'update');
    const module = await this.prisma.module.findFirst({ where: { id: moduleId, courseId } });
    if (!module) throw new NotFoundException('Module not found');
    await this.prisma.module.delete({ where: { id: moduleId } });
  }

  // --- Lessons (scoped by resolving module -> course -> ability) ---

  // Public: LessonsController's GET content route resolves through this
  // directly (moduleId is on the URL, unlike the learner's enrollment-scoped
  // equivalent in AssignmentsService, which never sees a moduleId).
  async findModuleOrThrow(ability: AppAbility, moduleId: string, action: CourseAction) {
    const module = await this.prisma.module.findFirst({
      where: { id: moduleId, course: accessibleBy(ability, action).Course },
    });
    if (!module) throw new NotFoundException('Module not found');
    return module;
  }

  async createLesson(ability: AppAbility, moduleId: string, dto: CreateLessonDto) {
    await this.findModuleOrThrow(ability, moduleId, 'update');
    return this.prisma.lesson.create({
      data: {
        moduleId,
        title: dto.title,
        contentType: dto.contentType,
        contentUrl: dto.contentUrl,
        contentJson: dto.contentJson as Prisma.InputJsonValue,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updateLesson(ability: AppAbility, moduleId: string, lessonId: string, dto: UpdateLessonDto) {
    await this.findModuleOrThrow(ability, moduleId, 'update');
    const lesson = await this.prisma.lesson.findFirst({ where: { id: lessonId, moduleId } });
    if (!lesson) throw new NotFoundException('Lesson not found');

    // An old uploaded object left behind under a changed contentType would
    // never be reachable again (the player only ever reads contentKey for
    // the lesson's *current* type) — clear it here, same as setThumbnail
    // replacing a course's old thumbnail, rather than leaking it in MinIO.
    const changingContentType = dto.contentType !== undefined && dto.contentType !== lesson.contentType;
    const updated = await this.prisma.lesson.update({
      where: { id: lessonId },
      data: {
        ...dto,
        contentJson: dto.contentJson as Prisma.InputJsonValue,
        ...(changingContentType ? { contentKey: null } : {}),
      },
    });
    if (changingContentType && lesson.contentKey) await this.storage.deleteObject(lesson.contentKey);
    return updated;
  }

  async removeLesson(ability: AppAbility, moduleId: string, lessonId: string) {
    await this.findModuleOrThrow(ability, moduleId, 'update');
    const lesson = await this.prisma.lesson.findFirst({ where: { id: lessonId, moduleId } });
    if (!lesson) throw new NotFoundException('Lesson not found');
    await this.prisma.lesson.delete({ where: { id: lessonId } });
    if (lesson.contentKey) await this.storage.deleteObject(lesson.contentKey);
  }

  // Uploaded lesson media (image/video), same pattern as setThumbnail: only
  // image/video lessons accept it (quiz/text/file content lives elsewhere —
  // file stays a plain external link, out of this phase's scope). The old
  // object is deleted only after the DB row points at the new key.
  async setLessonContent(
    ability: AppAbility,
    moduleId: string,
    lessonId: string,
    file: Express.Multer.File,
  ) {
    await this.findModuleOrThrow(ability, moduleId, 'update');
    const lesson = await this.prisma.lesson.findFirst({ where: { id: lessonId, moduleId } });
    if (!lesson) throw new NotFoundException('Lesson not found');
    if (lesson.contentType !== 'image' && lesson.contentType !== 'video') {
      throw new BadRequestException('Only image and video lessons accept uploaded content');
    }
    const expectedPrefix = lesson.contentType === 'image' ? 'image/' : 'video/';
    if (!file.mimetype.startsWith(expectedPrefix)) {
      throw new BadRequestException(`Expected a ${lesson.contentType} file`);
    }

    const oldKey = lesson.contentKey;
    const key = `lessons/${lessonId}/${randomUUID()}-${file.originalname}`;
    await this.storage.putObject(key, file.buffer, file.mimetype);
    const updated = await this.prisma.lesson.update({ where: { id: lessonId }, data: { contentKey: key } });
    if (oldKey) await this.storage.deleteObject(oldKey);
    return updated;
  }

  // Admin/manager builder-preview path only — gated on the same `read`
  // ability as everything else in this service. The learner-facing path is
  // deliberately separate (AssignmentsService.getLessonContentForEnrollment,
  // resolved through enrollment ownership) so this module-scoped route,
  // reachable with org-wide course:read, never becomes the way a learner
  // reads a draft course's content — see the Phase 4/6 draft-visibility
  // notes in PROGRESS.md for why that distinction matters here.
  async getLessonContentStream(ability: AppAbility, moduleId: string, lessonId: string) {
    await this.findModuleOrThrow(ability, moduleId, 'read');
    const lesson = await this.prisma.lesson.findFirst({ where: { id: lessonId, moduleId } });
    if (!lesson) throw new NotFoundException('Lesson not found');
    if (!lesson.contentKey) throw new NotFoundException('Lesson has no uploaded content');
    const [stream, contentType] = await Promise.all([
      this.storage.getObjectStream(lesson.contentKey),
      this.storage.getContentType(lesson.contentKey),
    ]);
    return { stream, contentType };
  }
}
