import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { OutboxEvent } from './enums/outbox-event.enum';
import { ClientProxy } from '@nestjs/microservices';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { Outbox } from './entities/outbox.entity';
import { InjectRepository } from '@nestjs/typeorm';
import {
  FRIEND_ADDED_EVENT,
  FRIEND_REMOVED_EVENT,
  FRIEND_REQUEST_SENT_EVENT,
} from 'src/constants/events';
import { lastValueFrom } from 'rxjs';

interface Route {
  client: ClientProxy;
  pattern: string;
}

@Injectable()
export class OutboxService {
  private logger: Logger = new Logger(OutboxService.name);
  private OUTBOX_ROUTES: Record<OutboxEvent, Route>;

  constructor(
    @Inject('GATEWAY_MQ') private readonly gatewayMQ: ClientProxy,
    @InjectRepository(Outbox) private outboxRepository: Repository<Outbox>,
  ) {
    this.OUTBOX_ROUTES = {
      [OutboxEvent.FriendRequestSent]: {
        client: this.gatewayMQ,
        pattern: FRIEND_REQUEST_SENT_EVENT,
      },
      [OutboxEvent.FriendRequestAccepted]: {
        client: this.gatewayMQ,
        pattern: FRIEND_ADDED_EVENT,
      },
      [OutboxEvent.FriendRemoved]: {
        client: this.gatewayMQ,
        pattern: FRIEND_REMOVED_EVENT,
      },
    };
  }

  @Interval(200)
  public async pollOutbox() {
    const message = await this.outboxRepository.findOne({
      where: { publishedAt: IsNull() },
      order: { id: 'ASC' },
    });
    if (!message) return;

    const route = this.OUTBOX_ROUTES[message.event];
    if (!route) {
      this.logger.error(`Unknown outbox route: ${message.event}`);
      return;
    }

    try {
      await lastValueFrom(route.client.emit(route.pattern, message.data));
      await this.outboxRepository.save({ ...message, publishedAt: new Date() });
    } catch (error) {
      this.logger.error(
        { err: error },
        'Failed updating message published time',
      );
    }
  }

  public async pushEvent(
    message: Pick<Outbox, 'event' | 'data'>,
    manager: EntityManager,
  ) {
    if (!Object.values(OutboxEvent).includes(message.event)) {
      throw new Error(`Event type ${message.event} is not of type OutboxEvent`);
    }

    await manager.save(Outbox, message);
  }
}
