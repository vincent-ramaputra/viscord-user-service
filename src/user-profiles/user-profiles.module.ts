import { forwardRef, Module } from '@nestjs/common';
import { UserProfilesService } from './user-profiles.service';
import { UserProfilesController } from './user-profiles.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserProfile } from './entities/user-profile.entity';
import { StorageModule } from 'src/storage/storage.module';
import { HttpModule } from '@nestjs/axios';
import { RelationshipsModule } from 'src/relationships/relationships.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserProfile]),
    StorageModule,
    HttpModule,
    forwardRef(() => RelationshipsModule),
  ],

  controllers: [UserProfilesController],
  providers: [UserProfilesService],
  exports: [UserProfilesService],
})
export class UserProfilesModule {}
