import { AutoMap } from '@automapper/classes';
import { UserStatus } from 'src/user-profiles/enums/user-status.enum';

export class UpdateStatusDTO {
  @AutoMap()
  userId: string;

  @AutoMap()
  status: UserStatus;
}
