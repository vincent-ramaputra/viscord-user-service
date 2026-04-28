import { Injectable } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class RedisService {
  private client: RedisClientType;

  async getClient(): Promise<RedisClientType> {
    if (!this.client) {
      this.client = createClient({
        url: `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`,
      });

      this.client.on('error', (err) =>
        console.error('Redis Client Error', err),
      );
      await this.client.connect();
    }

    return this.client;
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
    }
  }
}
