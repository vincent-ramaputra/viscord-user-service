import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { OutboxEvent } from '../enums/outbox-event.enum';

@Entity()
export class Outbox {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ type: 'enum', enum: OutboxEvent })
  event: OutboxEvent;

  @Column({ type: 'jsonb' })
  data: any;

  @Column({ name: 'published_at', nullable: true })
  publishedAt: Date;
}
