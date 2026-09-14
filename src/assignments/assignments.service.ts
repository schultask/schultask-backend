import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { accessibleBy } from '@casl/prisma';
import { EnrollmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CoursesService } from '../courses/courses.service';
import { StorageService } from '../storage/storage.service';
import { AppAbility } from '../casl/casl-ability.factory';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { UpdateProgressDto } from './dto/update-progress.dto';
import { SubmitQuizDto } from './dto/submit-quiz.dto';

type QuizOption = { id: string; text: string };
type QuizQuestion = { id: string; prompt: string; options: QuizOption[]; correctOptionId: string };
type QuizContent = { questions: QuizQuestion[] };

function isQuizContent(value: unknown): value is QuizContent {
  return (
    !!value &&
    typeof value === 'object' &&
    Array.isArray((value as { questions?: unknown }).questions)
  );
}

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly courses: CoursesService,
    private readonly storage: StorageService,
  ) {}

  // Two ids cross an org boundary here — the course and every target user —
  // and both have to be checked independently, or an admin could assign
  // their own course to another org's user, or another org's course to
  // their own users. See PROGRESS.md's Phase 5 notes.
  async create(ability: AppAbility, orgId: string, createdBy: string, dto: CreateAssignmentDto) {
    const course = await this.courses.findCourseOrThrow(ability, dto.courseId, 'update');
    if (course.status !== 'published') {
      throw new BadRequestException('Cannot assign a draft course');
    }

    const uniqueUserIds = [...new Set(dto.userIds)];
    const targetUsers = await this.prisma.user.findMany({
      where: { id: { in: uniqueUserIds }, orgId },
      select: { id: true },
    });
    if (targetUsers.length !== uniqueUserIds.length) {
      throw new BadRequestException('One or more target users are invalid for this organization');
    }

    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.assignment.create({
        data: {
          orgId,
          courseId: dto.courseId,
          createdBy,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          targets: { createMany: { data: uniqueUserIds.map((userId) => ({ userId })) } },
        },
        include: { targets: true },
      });

      // Assigning a course enrolls each target — creating the Enrollment
      // row here (rather than waiting for the learner to "start" it) is
      // what makes an assignment show up in a learner's course list at all.
      // skipDuplicates: a user can be assigned the same course more than
      // once (e.g. re-assigned after a deadline); Enrollment is unique on
      // (userId, courseId), so a second assignment must not reset progress.
      await tx.enrollment.createMany({
        data: uniqueUserIds.map((userId) => ({ userId, courseId: dto.courseId })),
        skipDuplicates: true,
      });

      return assignment;
    });
  }

  async findAll(ability: AppAbility) {
    return this.prisma.assignment.findMany({
      where: accessibleBy(ability, 'read').Assignment,
      include: { targets: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(ability: AppAbility, id: string) {
    const assignment = await this.prisma.assignment.findFirst({
      where: { AND: [{ id }, accessibleBy(ability, 'read').Assignment] },
      include: { targets: true, course: true },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    return assignment;
  }

  // Self-scoped — a learner sees only what they're targeted by, by ownership,
  // not through an org-wide CASL permission (learners have no `assignment`
  // permission at all, see seed.ts).
  async findMine(userId: string) {
    return this.prisma.assignmentTarget.findMany({
      where: { userId },
      include: { assignment: { include: { course: true } } },
    });
  }

  async findMyEnrollments(userId: string) {
    return this.prisma.enrollment.findMany({
      where: { userId },
      include: { course: true },
      orderBy: { startedAt: 'desc' },
    });
  }

  // The course player's fetch — deliberately NOT `CoursesService.findOne`
  // (gated on `read`/`Course`), because a learner has org-wide `course:read`
  // and a bare course id would let them open a draft they were never
  // enrolled in (the gap flagged in Phase 4/5's notes). Requiring the id to
  // resolve through the learner's own enrollment closes it on the one path
  // that's actually reachable from the player UI.
  async findEnrollmentCourse(userId: string, enrollmentId: string) {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { id: enrollmentId, userId },
      include: {
        course: {
          include: { modules: { orderBy: { sortOrder: 'asc' }, include: { lessons: { orderBy: { sortOrder: 'asc' } } } } },
        },
      },
    });
    if (!enrollment) throw new NotFoundException('Enrollment not found');

    // The answer key (correctOptionId) must never reach the learner's browser
    // before they submit — this is the one path a plain <img src>-style network
    // inspection could otherwise read it from. GET /courses/:id (admin) is
    // untouched; admins need to see and edit correct answers.
    return {
      ...enrollment,
      course: {
        ...enrollment.course,
        modules: enrollment.course.modules.map((module) => ({
          ...module,
          lessons: module.lessons.map((lesson) => {
            if (lesson.contentType !== 'quiz' || !isQuizContent(lesson.contentJson)) return lesson;
            return {
              ...lesson,
              contentJson: {
                questions: lesson.contentJson.questions.map((q) => ({
                  id: q.id,
                  prompt: q.prompt,
                  options: q.options,
                })),
              },
            };
          }),
        })),
      },
    };
  }

  // The player's media source for an uploaded image/video lesson —
  // deliberately not CoursesService.getLessonContentStream (gated on
  // course:read), for the same reason findEnrollmentCourse above isn't
  // CoursesService.findOne: a learner has org-wide course:read, so a
  // module-scoped route would let them stream a draft course's content
  // they were never assigned. Resolving through the enrollment closes that
  // on the one path the player actually calls.
  async getLessonContentForEnrollment(userId: string, enrollmentId: string, lessonId: string) {
    const enrollment = await this.prisma.enrollment.findFirst({ where: { id: enrollmentId, userId } });
    if (!enrollment) throw new NotFoundException('Enrollment not found');

    const lesson = await this.prisma.lesson.findFirst({
      where: { id: lessonId, module: { courseId: enrollment.courseId } },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    if (!lesson.contentKey) throw new NotFoundException('Lesson has no uploaded content');

    const [stream, contentType] = await Promise.all([
      this.storage.getObjectStream(lesson.contentKey),
      this.storage.getContentType(lesson.contentKey),
    ]);
    return { stream, contentType };
  }

  async submitQuiz(userId: string, orgId: string, enrollmentId: string, lessonId: string, dto: SubmitQuizDto) {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { id: enrollmentId, userId },
    });
    if (!enrollment) throw new NotFoundException('Enrollment not found');

    const lesson = await this.prisma.lesson.findFirst({
      where: { id: lessonId, module: { courseId: enrollment.courseId } },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    if (lesson.contentType !== 'quiz') throw new BadRequestException('This lesson is not a quiz');
    if (!isQuizContent(lesson.contentJson) || lesson.contentJson.questions.length === 0) {
      throw new BadRequestException('This quiz has no questions');
    }

    const questions = lesson.contentJson.questions;
    const correctCount = questions.filter((q) => dto.answers[q.id] === q.correctOptionId).length;
    const totalCount = questions.length;
    const scorePct = Math.round((correctCount / totalCount) * 100);

    await this.prisma.learningEvent.create({
      data: {
        orgId,
        userId,
        verb: 'quiz_submitted',
        objectType: 'lesson',
        objectId: lessonId,
        result: { scorePct, correctCount, totalCount },
      },
    });

    return { scorePct, correctCount, totalCount };
  }

  async updateMyProgress(userId: string, enrollmentId: string, dto: UpdateProgressDto) {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { id: enrollmentId, userId },
    });
    if (!enrollment) throw new NotFoundException('Enrollment not found');

    const now = new Date();
    const status =
      dto.progressPct >= 100
        ? EnrollmentStatus.completed
        : dto.progressPct > 0
          ? EnrollmentStatus.in_progress
          : EnrollmentStatus.not_started;

    return this.prisma.enrollment.update({
      where: { id: enrollmentId },
      data: {
        progressPct: dto.progressPct,
        status,
        startedAt: enrollment.startedAt ?? (status !== EnrollmentStatus.not_started ? now : undefined),
        completedAt: status === EnrollmentStatus.completed ? (enrollment.completedAt ?? now) : null,
      },
    });
  }

  // Manager/admin view of who's enrolled in a course — scoped by resolving
  // the course through CASL first (Enrollment itself carries no org_id).
  async findEnrollmentsForCourse(ability: AppAbility, courseId: string) {
    await this.courses.findCourseOrThrow(ability, courseId, 'read');
    return this.prisma.enrollment.findMany({
      where: { courseId },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
  }
}
