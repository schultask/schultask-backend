import { IsObject } from 'class-validator';

export class SubmitQuizDto {
  // questionId -> chosen optionId
  @IsObject()
  answers!: Record<string, string>;
}
