import { LessonContentType } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateLessonDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsEnum(LessonContentType)
  contentType?: LessonContentType;

  @IsOptional()
  @IsString()
  contentUrl?: string;

  @IsOptional()
  contentJson?: unknown;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
