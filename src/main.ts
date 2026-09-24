import './telemetry/tracing';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { USER_QUEUE } from './constants/events';
import { join } from 'path';
import { Logger } from 'nestjs-pino';
import pino from 'pino';
import { LoggerService } from '@nestjs/common';

const _pino = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  formatters: {
    level: (label: string) => ({ level: label }),
  },
});
const bootstrapLogger: LoggerService = {
  log: (msg: string, ctx?: string) => _pino.info({ context: ctx }, msg),
  error: (msg: unknown, trace?: string, ctx?: string) =>
    msg instanceof Error
      ? _pino.error({ context: ctx, err: msg }, msg.message)
      : _pino.error({ context: ctx, trace }, String(msg)),
  warn: (msg: string, ctx?: string) => _pino.warn({ context: ctx }, msg),
  debug: (msg: string, ctx?: string) => _pino.debug({ context: ctx }, msg),
  verbose: (msg: string, ctx?: string) => _pino.trace({ context: ctx }, msg),
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: bootstrapLogger,
  });
  app.useLogger(app.get(Logger));

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
