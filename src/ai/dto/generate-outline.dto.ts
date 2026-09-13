import { IsOptional, IsString, MinLength } from 'class-validator';

export class GenerateOutlineDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;
}
