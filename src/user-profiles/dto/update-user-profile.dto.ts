import { IsOptional, IsString } from 'class-validator';

export class UpdateUserProfileDto {
  id: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  pronouns?: string;

  @IsOptional()
  @IsString()
  bio?: string;
}
