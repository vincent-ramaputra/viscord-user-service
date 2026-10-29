import { IsNotEmpty, IsString } from 'class-validator';

export class CreateRelationshipDto {
  @IsNotEmpty()
  @IsString()
  username: string;
}
