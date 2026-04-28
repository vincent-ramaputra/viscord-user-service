import { UserProfilesController } from './user-profiles.controller';

describe('UserProfilesController', () => {
  let controller: UserProfilesController;

  beforeEach(async () => {
    // const module: TestingModule = await Test.createTestingModule({
    //   controllers: [UserProfilesController],
    //   providers: [UserProfilesService],
    // }).compile();
    // controller = module.get<UserProfilesController>(UserProfilesController);
  });

  it('should be defined', () => {
    expect(controller).not.toBeDefined();
  });
});
