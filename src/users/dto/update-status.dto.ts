import { IsEnum, IsInt } from 'class-validator';
import { UserStatus } from 'src/user-profiles/enums/user-status.enum';

export class UpdateStatusDTO {
  userId: string;

  @IsInt()
  @IsEnum(UserStatus)
  status: UserStatus;
}
