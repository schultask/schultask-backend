import { IsInt, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateModuleDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
