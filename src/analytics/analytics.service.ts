import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppAbility } from '../casl/casl-ability.factory';
import { CoursesService } from '../courses/courses.service';

const DAU_WINDOW_DAYS = 30;

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly courses: CoursesService,
  ) {}

  // No CASL scoping applies here (SCOPE_STRATEGY['analytics'] = 'none') —
  // orgId comes from the caller's JWT only, never a request param. This is
  // the actual org boundary for this endpoint; there is no accessibleBy()
  // safety net behind it the way list endpoints have.
  async orgOverview(orgId: string) {
    const since = new Date(Date.now() - DAU_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const dauRows = await this.prisma.dailyActiveUsers.findMany({
      where: { orgId, date: { gte: since } },
      orderBy: { date: 'asc' },
    });

    const allStats = await this.prisma.courseCompletionStats.findMany({
      where: { course: { orgId } },
      orderBy: { date: 'desc' },
      include: { course: { select: { title: true } } },
    });
    // Latest snapshot per course: allStats is already date-desc, so the
    // first row seen per courseId is its latest.
    const latestByCourse = new Map<string, (typeof allStats)[number]>();
    for (const row of allStats) {
      if (!latestByCourse.has(row.courseId)) latestByCourse.set(row.courseId, row);
    }
    const courseCompletion = [...latestByCourse.values()].map((row) => ({
      courseId: row.courseId,
      title: row.course.title,
      enrolledCount: row.enrolledCount,
      completedCount: row.completedCount,
      avgProgressPct: row.avgProgressPct,
    }));

    const totalEnrolled = courseCompletion.reduce((sum, c) => sum + c.enrolledCount, 0);
    const totalCompleted = courseCompletion.reduce((sum, c) => sum + c.completedCount, 0);

    return {
      activeLearners: dauRows.at(-1)?.userCount ?? 0,
      completionRate: totalEnrolled === 0 ? 0 : (totalCompleted / totalEnrolled) * 100,
      coursesInProgress: courseCompletion.filter((c) => c.enrolledCount > c.completedCount).length,
      dau: dauRows.map((row) => ({ date: row.date.toISOString().slice(0, 10), count: row.userCount })),
      courseCompletion,
    };
  }

  // findCourseOrThrow enforces the cross-org 404 — a bare
  // `courseCompletionStats.findMany({ where: { courseId } })` would happily
  // return another org's numbers to a caller who only has the *type*-level
  // `analytics:view_org` permission, since Analytics itself has no
  // accessibleBy() scoping.
  async courseStats(ability: AppAbility, courseId: string) {
    await this.courses.findCourseOrThrow(ability, courseId, 'read');
    const rows = await this.prisma.courseCompletionStats.findMany({
      where: { courseId },
      orderBy: { date: 'asc' },
    });
    return rows.map((row) => ({
      date: row.date.toISOString().slice(0, 10),
      enrolledCount: row.enrolledCount,
      completedCount: row.completedCount,
      avgProgressPct: row.avgProgressPct,
    }));
  }
}
