import { UserStatus } from 'src/user-profiles/enums/user-status.enum';

export class UpdateStatusDTO {
  userId: string;

  status: UserStatus;
}
