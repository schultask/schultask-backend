import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EnrollmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// UTC calendar day, no time component — matches the `@db.Date` columns on
// DailyActiveUsers/CourseCompletionStats. Upserting a `Date` with a time
// component would make the (org_id, date) / (course_id, date) unique
// constraints fail to dedupe re-runs on the same day, the same class of
// bug as the pre-fix (org_id, email) constraint in Phase 3.
function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

@Injectable()
export class RollupService {
  private readonly logger = new Logger(RollupService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Computes and upserts both rollup tables for one org on one calendar
  // day. Idempotent — re-running for the same (org, date) overwrites, it
  // never accumulates.
  async runForOrg(orgId: string, rawDate: Date): Promise<void> {
    const date = utcMidnight(rawDate);
    const nextDay = new Date(date.getTime() + 24 * 60 * 60 * 1000);

    const activeUsers = await this.prisma.learningEvent.findMany({
      where: { orgId, createdAt: { gte: date, lt: nextDay } },
      distinct: ['userId'],
      select: { userId: true },
    });
    await this.prisma.dailyActiveUsers.upsert({
      where: { orgId_date: { orgId, date } },
      update: { userCount: activeUsers.length },
      create: { orgId, date, userCount: activeUsers.length },
    });

    // Course completion stats are a snapshot of live Enrollment aggregates,
    // not a count of that day's events — see the model comment in
    // schema.prisma. No percentage-at-a-point-in-time event exists, so
    // there's nothing in learning_events these fields could be derived from.
    const courses = await this.prisma.course.findMany({ where: { orgId }, select: { id: true } });
    for (const { id: courseId } of courses) {
      const [enrolledCount, completedCount, avg] = await Promise.all([
        this.prisma.enrollment.count({ where: { courseId } }),
        this.prisma.enrollment.count({ where: { courseId, status: EnrollmentStatus.completed } }),
        this.prisma.enrollment.aggregate({ where: { courseId }, _avg: { progressPct: true } }),
      ]);
      await this.prisma.courseCompletionStats.upsert({
        where: { courseId_date: { courseId, date } },
        update: { enrolledCount, completedCount, avgProgressPct: avg._avg.progressPct ?? 0 },
        create: { courseId, date, enrolledCount, completedCount, avgProgressPct: avg._avg.progressPct ?? 0 },
      });
    }
  }

  // Runs for yesterday AND today, not just today: a job that only ever
  // computes "today" at 02:00 would freeze every historical DAU row at a
  // permanent 2-hour count (00:00-02:00) since nothing ever revisits it
  // once the date has passed. Running both also self-heals a missed night
  // (e.g. the host was down) without needing a backfill script.
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async runNightly(): Promise<void> {
    const orgs = await this.prisma.organization.findMany({ select: { id: true } });
    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    for (const { id: orgId } of orgs) {
      await this.runForOrg(orgId, yesterday);
      await this.runForOrg(orgId, today);
    }
    this.logger.log(`Rollup complete for ${orgs.length} org(s)`);
  }
}
