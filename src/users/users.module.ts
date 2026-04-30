import { forwardRef, Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { UserProfilesModule } from 'src/user-profiles/user-profiles.module';
import { HttpModule } from '@nestjs/axios';
import { StorageModule } from 'src/storage/storage.module';

@Module({
  controllers: [UsersController],
  providers: [UsersService],
  imports: [forwardRef(() => UserProfilesModule), HttpModule, StorageModule],
  exports: [UsersService],
})
export class UsersModule {}
