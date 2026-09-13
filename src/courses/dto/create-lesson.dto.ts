import { LessonContentType } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateLessonDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsEnum(LessonContentType)
  contentType!: LessonContentType;

  @IsOptional()
  @IsString()
  contentUrl?: string;

  @IsOptional()
  contentJson?: unknown;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
