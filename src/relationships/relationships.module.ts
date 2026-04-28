import { forwardRef, Module } from '@nestjs/common';
import { RelationshipsService } from './relationships.service';
import { RelationshipsController } from './relationships.controller';
import { UsersModule } from 'src/users/users.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Relationship } from './entities/relationship.entity';
import { UserProfilesModule } from 'src/user-profiles/user-profiles.module';

@Module({
  controllers: [RelationshipsController],
  providers: [RelationshipsService],
  imports: [
    UsersModule,
    forwardRef(() => UserProfilesModule),
    TypeOrmModule.forFeature([Relationship]),
  ],
  exports: [RelationshipsService],
})
export class RelationshipsModule {}
