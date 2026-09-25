import { Module } from '@nestjs/common';
import { OutboxService } from './outbox.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Outbox } from './entities/outbox.entity';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { GATEWAY_QUEUE } from 'src/constants/events';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  providers: [OutboxService],
  imports: [
    TypeOrmModule.forFeature([Outbox]),
    ScheduleModule.forRoot(),
    ClientsModule.registerAsync({
      clients: [
        {
          name: 'GATEWAY_MQ',
          inject: [ConfigService],
          useFactory: (configService: ConfigService) => {
            return {
              transport: Transport.RMQ,
              options: {
                urls: [
                  `amqp://${configService.get('RMQ_HOST')}:${configService.get('RMQ_PORT')}`,
                ],
                queue: GATEWAY_QUEUE,
                queueOptions: { durable: true },
                persistent: true,
              },
            };
          },
        },
      ],
    }),
  ],
  exports: [OutboxService],
})
export class OutboxModule {}
