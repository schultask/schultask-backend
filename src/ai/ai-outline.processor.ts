import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { OpenAiService } from './openai.service';
import { AI_OUTLINE_QUEUE } from './ai.constants';

export type GenerateOutlineJobData = {
  orgId: string;
  userId: string;
  title: string;
  description?: string;
};

export type GenerateOutlineJobResult = { courseId: string };

@Processor(AI_OUTLINE_QUEUE)
export class AiOutlineProcessor extends WorkerHost {
  constructor(
    private readonly openai: OpenAiService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<GenerateOutlineJobData>): Promise<GenerateOutlineJobResult> {
    const { orgId, userId, title, description } = job.data;
    const outline = await this.openai.generateOutline(title, description);

    const course = await this.prisma.course.create({
      data: {
        orgId,
        createdBy: userId,
        title,
        description,
        aiGenerated: true,
        modules: {
          create: outline.modules.map((module, moduleIndex) => ({
            title: module.title,
            sortOrder: moduleIndex,
            lessons: {
              create: module.lessons.map((lesson, lessonIndex) => ({
                title: lesson.title,
                contentType: 'text',
                contentJson: { body: lesson.body },
                sortOrder: lessonIndex,
              })),
            },
          })),
        },
      },
    });

    return { courseId: course.id };
  }
}
