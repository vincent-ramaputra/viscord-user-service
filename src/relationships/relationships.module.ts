import { forwardRef, Module } from '@nestjs/common';
import { RelationshipsService } from './relationships.service';
import { RelationshipsController } from './relationships.controller';
import { UsersModule } from 'src/users/users.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Relationship } from './entities/relationship.entity';
import { UserProfilesModule } from 'src/user-profiles/user-profiles.module';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { GATEWAY_QUEUE } from 'src/constants/events';

@Module({
  controllers: [RelationshipsController],
  providers: [RelationshipsService],
  imports: [
    UsersModule,
    forwardRef(() => UserProfilesModule),
    TypeOrmModule.forFeature([Relationship]),
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
  exports: [RelationshipsService],
})
export class RelationshipsModule {}
