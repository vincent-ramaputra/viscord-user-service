import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserStatus } from '../enums/user-status.enum';
import { AutoMap } from '@automapper/classes';

@Entity({ name: 'user_profile' })
export class UserProfile {
  @AutoMap()
  @PrimaryColumn()
  id: string;

  @AutoMap()
  @Column({ unique: true })
  username: string;

  @AutoMap()
  @Column({ name: 'display_name' })
  displayName: string;

  @AutoMap()
  @Column({ nullable: true })
  pronouns?: string;

  @AutoMap()
  @Column({ nullable: true })
  bio?: string;

  @AutoMap()
  @Column({
    type: 'enum',
    enum: UserStatus,
    default: UserStatus.Online,
  })
  status: UserStatus;

  @AutoMap()
  @Column({ nullable: true })
  avatarURL?: string;

  @AutoMap()
  @Column({ nullable: true })
  defaultAvatarURL: string;

  @AutoMap()
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @AutoMap()
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
