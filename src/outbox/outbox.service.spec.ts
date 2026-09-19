import { Test, TestingModule } from '@nestjs/testing';
import { OutboxService } from './outbox.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Outbox } from './entities/outbox.entity';
import { OutboxEvent } from './enums/outbox-event.enum';
import { FRIEND_REQUEST_SENT_EVENT } from 'src/constants/events';


function buildMessage(overrides: Partial<Outbox> = {}): Outbox {
  return {
    id: '1',
    event: OutboxEvent.FriendRequestSent,
    data: {
      'foo': 'bar'
    },
    publishedAt: null,
    ...overrides
  };
}

describe('OutboxService', () => {
  let service: OutboxService;
  let gatewayMQ: { emit: jest.Mock };
  let outboxRepository: { findOne: jest.Mock, save: jest.Mock }

  beforeAll(async () => {
    gatewayMQ = {
      emit: jest.fn(),
    };

    outboxRepository = {
      findOne: jest.fn(),
      save: jest.fn()
    }
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutboxService,
        {
          provide: 'GATEWAY_MQ',
          useValue: gatewayMQ
        },
        {
          provide: getRepositoryToken(Outbox),
          useValue: outboxRepository
        }
      ],

    }).compile();

    service = module.get<OutboxService>(OutboxService);
  });

  beforeEach(() => {
    jest.restoreAllMocks();
  })

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('pollOutbox', () => {
    it('does nothing when there is no published message', async () => {
      outboxRepository.findOne.mockResolvedValue(null)
      await service.pollOutbox();

      expect(gatewayMQ.emit).not.toHaveBeenCalled();
    });

    it('should emit event with the correct pattern', async () => {
      const message = buildMessage();

      outboxRepository.findOne.mockResolvedValue(message);

      await service.pollOutbox();

      expect(gatewayMQ.emit).toHaveBeenCalledWith(FRIEND_REQUEST_SENT_EVENT, message.data);
      expect(outboxRepository.save).toHaveBeenCalledWith({
        ...message,
        id: message.id,
        publishedAt: expect.any(Date)
      } as Outbox)
    })
  })
});
