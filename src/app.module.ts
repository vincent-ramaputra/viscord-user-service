import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { UserProfilesModule } from './user-profiles/user-profiles.module';
import { UsersModule } from './users/users.module';
import { RelationshipsModule } from './relationships/relationships.module';
import { StorageService } from './storage/storage.service';
import { StorageModule } from './storage/storage.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule,
    UserProfilesModule,
    UsersModule,
    RelationshipsModule,
    StorageModule,
    RedisModule,
  ],
  providers: [StorageService],
})
export class AppModule {}
