import { UserStatus } from 'src/user-profiles/enums/user-status.enum';

export interface UserStatusUpdateDTO {
  userId: string;
  status: UserStatus;
}
