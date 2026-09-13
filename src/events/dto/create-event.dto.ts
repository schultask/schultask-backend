import { LearningEventVerb } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateEventDto {
  @IsEnum(LearningEventVerb)
  verb!: LearningEventVerb;

  @IsString()
  @MinLength(1)
  objectType!: string;

  @IsString()
  @MinLength(1)
  objectId!: string;

  @IsOptional()
  result?: unknown;

  @IsOptional()
  context?: unknown;
}
