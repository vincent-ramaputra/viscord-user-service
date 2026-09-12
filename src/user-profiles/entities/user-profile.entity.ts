import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserStatus } from '../enums/user-status.enum';

@Entity({ name: 'user_profile' })
export class UserProfile {
  @PrimaryColumn()
  id: string;

  @Column({ unique: true })
  username: string;

  @Column({ name: 'display_name' })
  displayName: string;

  @Column({ nullable: true })
  pronouns?: string;

  @Column({ nullable: true })
  bio?: string;

  @Column({
    type: 'enum',
    enum: UserStatus,
    default: UserStatus.Online,
  })
  status: UserStatus;

  @Column({ nullable: true })
  avatarURL?: string;

  @Column({ nullable: true })
  defaultAvatarURL: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
