import { Body, Controller, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AbilityGuard } from '../casl/ability.guard';
import { CheckAbility } from '../casl/check-ability.decorator';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { AI_OUTLINE_QUEUE } from './ai.constants';
import { GenerateOutlineDto } from './dto/generate-outline.dto';
import { GenerateOutlineJobData, GenerateOutlineJobResult } from './ai-outline.processor';

@Controller('ai')
@UseGuards(JwtAuthGuard, AbilityGuard)
export class AiController {
  constructor(@InjectQueue(AI_OUTLINE_QUEUE) private readonly queue: Queue<GenerateOutlineJobData>) {}

  // Reuses the existing course:create permission — generating an outline is
  // just another way to create a Course, the same subject POST /courses uses.
  @Post('generate-outline')
  @CheckAbility('create', 'Course')
  async generateOutline(@CurrentUser() user: CurrentUserPayload, @Body() dto: GenerateOutlineDto) {
    const job = await this.queue.add('generate', {
      orgId: user.orgId,
      userId: user.id,
      title: dto.title,
      description: dto.description,
    });
    return { jobId: job.id };
  }

  @Get('jobs/:id')
  @CheckAbility('create', 'Course')
  async getJob(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    const job = await this.queue.getJob(id);
    // Job ids are sequential, not secrets — this is what turns a guessed
    // id from another org into a 404 instead of a cross-org status leak,
    // the same pattern findCourseOrThrow uses for every other resource.
    if (!job || job.data.orgId !== user.orgId) throw new NotFoundException('Job not found');

    const status = await job.getState();
    const result = job.returnvalue as GenerateOutlineJobResult | undefined;
    return { status, courseId: result?.courseId ?? null, error: job.failedReason ?? null };
  }
}
