import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule'
import { OutboxEvent } from './enums/outbox-event.enum';
import { ClientProxy } from '@nestjs/microservices';
import { Repository } from 'typeorm';
import { Outbox } from './entities/outbox.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { FRIEND_REQUEST_SENT_EVENT } from 'src/constants/events';

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
        @InjectRepository(Outbox) private outboxRepository: Repository<Outbox>
    ) {
        this.OUTBOX_ROUTES = {
            [OutboxEvent.FriendRequestSent]: { client: this.gatewayMQ, pattern: FRIEND_REQUEST_SENT_EVENT }
        }
    }

    @Cron("1 * * * * *")
    public async pollOutbox() {
        const message = await this.outboxRepository.findOne({ where: { publishedAt: null }, order: { id: 'ASC' } });

        if (!message) return;

        const route = this.OUTBOX_ROUTES[message.event];

        route.client.emit(route.pattern, message.data);

        try {
            await this.outboxRepository.save({ ...message, publishedAt: new Date() });
        } catch (error) {
            this.logger.error("Failed updating message published time");
        }
    }

}
