import { ArrayMinSize, IsArray, IsISO8601, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateAssignmentDto {
  @IsUUID()
  courseId!: string;

  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  userIds!: string[];
}
