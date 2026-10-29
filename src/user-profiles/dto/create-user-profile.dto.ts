import { IsNotEmpty, IsUUID } from 'class-validator';
import { IsUsername } from '../domain/username';
export class CreateUserProfileDto {
  @IsUUID()
  @IsNotEmpty({ message: 'User id is empty' })
  id: string;

  @IsUsername()
  username: string;

  @IsNotEmpty({ message: 'Display name must be filled' })
  displayName: string;
}
