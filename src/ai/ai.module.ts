import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CaslModule } from '../casl/casl.module';
import { AiController } from './ai.controller';
import { OpenAiService } from './openai.service';
import { AiOutlineProcessor } from './ai-outline.processor';
import { AI_OUTLINE_QUEUE } from './ai.constants';

@Module({
  imports: [BullModule.registerQueue({ name: AI_OUTLINE_QUEUE }), CaslModule],
  controllers: [AiController],
  providers: [OpenAiService, AiOutlineProcessor],
})
export class AiModule {}
