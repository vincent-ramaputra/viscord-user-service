import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { hostname } from 'os';
import { USER_QUEUE } from './constants/events';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: 'https://viscord.app',
    methods: 'GET,POST,PUT,DELETE',
    // credentials: true
  });

  console.log(process.env.GRPC_PORT);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: ['relationships', 'users'],
      protoPath: [
        join(__dirname, 'proto/relationships.proto'),
        join(__dirname, 'proto/users.proto'),
      ],
      url: `0.0.0.0:${process.env.GRPC_PORT}`,
    },
  });

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [`amqp://${process.env.RMQ_HOST}:${process.env.RMQ_PORT}`],
      queue: USER_QUEUE,
      queueOptions: {
        durable: true,
      },
    },
  });

  // app.connectMicroservice<MicroserviceOptions>({
  //   transport: Transport.RMQ,
  //   options: {
  //     urls: [`amqp://${process.env.RMQ_HOST}:${process.env.RMQ_PORT}`],
  //     queue: 'user-status-queue',
  //     queueOptions: {
  //       durable: true
  //     }
  //   }
  // });

  await app.startAllMicroservices();
  await app.listen(process.env.APP_PORT);
  //  try {
  // } catch (err) {
  //   console.error('Failed to connect to RabbitMQ, will retry...');
  //   // Optionally retry logic here, or circuit breaker pattern
  // }
}
bootstrap();
