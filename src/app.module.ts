import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { UserProfilesModule } from './user-profiles/user-profiles.module';
import { UsersModule } from './users/users.module';
import { RelationshipsModule } from './relationships/relationships.module';
import { StorageService } from './storage/storage.service';
import { StorageModule } from './storage/storage.module';
import { RedisModule } from './redis/redis.module';
import { IncomingMessage, ServerResponse } from 'http';
import { LoggerModule } from 'nestjs-pino';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './common/guards/auth/auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV == 'production' ? 'info' : 'debug',
        formatters: {
          level: (label: string) => ({ level: label }),
        },
        redact: [
          'req.headers.cookie',
          'req.headers.authorization',
          'res.headers["set-cookie"]',
        ],
        serializers: {
          req(req: IncomingMessage & { id: number }) {
            return {
              id: req.id,
              method: req.method,
              url: req.url,
              'x-forwarded-uri': req.headers['x-forwarded-uri'],
            };
          },
          res(res: ServerResponse) {
            return {
              statusCode: res.statusCode,
            };
          },
        },
      },
    }),
    DatabaseModule,
    UserProfilesModule,
    UsersModule,
    RelationshipsModule,
    StorageModule,
    RedisModule,
  ],
  providers: [
    StorageService,
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
})
export class AppModule {}
