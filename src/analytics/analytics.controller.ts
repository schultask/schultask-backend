import { Controller, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AbilityGuard } from '../casl/ability.guard';
import { CheckAbility } from '../casl/check-ability.decorator';
import { AppAbility } from '../casl/casl-ability.factory';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { AnalyticsService } from './analytics.service';
import { RollupService } from './rollup.service';

type AbilityRequest = { ability: AppAbility };

@Controller('analytics')
@UseGuards(JwtAuthGuard, AbilityGuard)
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly rollup: RollupService,
  ) {}

  @Get('org-overview')
  @CheckAbility('view_org', 'Analytics')
  orgOverview(@CurrentUser() user: CurrentUserPayload) {
    return this.analytics.orgOverview(user.orgId);
  }

  @Get('course/:id')
  @CheckAbility('view_org', 'Analytics')
  courseStats(@Req() req: AbilityRequest, @Param('id') id: string) {
    return this.analytics.courseStats(req.ability, id);
  }

  // Manual on-demand recompute, scoped to the caller's own org — the
  // nightly cron is the primary path (RollupService.runNightly), but that
  // means every KPI is empty until the next 2am run. This lets an admin (or
  // this phase's own verification) get real numbers immediately after
  // seeding events, without waiting or touching other orgs' data.
  // Recomputing your own org's derived rollup rows is a reasonable action
  // to gate on the same read permission (`analytics:view_org`) rather than
  // inventing a new write permission for it.
  @Post('rollup')
  @HttpCode(200)
  @CheckAbility('view_org', 'Analytics')
  async triggerRollup(@CurrentUser() user: CurrentUserPayload) {
    await this.rollup.runForOrg(user.orgId, new Date());
    return { ok: true };
  }
}
