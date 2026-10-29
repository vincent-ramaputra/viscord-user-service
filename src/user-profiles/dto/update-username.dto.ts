import { IsUsername } from 'src/user-profiles/domain/username';

export class UpdateUsernameDTO {
  @IsUsername()
  username: string;
}
