import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { RelationshipType } from '../enums/relationship-type.enum';

@Entity()
export class Relationship {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'sender_id' })
  senderId: string;

  @Column({ name: 'recipient_id' })
  recipientId: string;

  @Column({
    type: 'enum',
    enum: RelationshipType,
    default: RelationshipType.None,
  })
  type: RelationshipType;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @CreateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
