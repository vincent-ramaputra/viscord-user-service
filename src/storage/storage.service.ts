import { Storage } from '@google-cloud/storage';
import { Injectable, Logger } from '@nestjs/common';
import { StoragePath } from './storage.paths';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private client: Storage;
  private bucket: string;

  constructor(configService: ConfigService) {
    this.client = new Storage();
    this.bucket = configService.getOrThrow('AWS_BUCKET');
  }

  async getFiles(prefix: StoragePath): Promise<string[]> {
    try {
      const gcsPrefix = prefix.replace(/^\//, '') + '/';
      const [files] = await this.client
        .bucket(this.bucket)
        .getFiles({ prefix: gcsPrefix });

      const fileNames = files
        .map((file) => file.name.replace(gcsPrefix, ''))
        .filter((fileName) => fileName !== '');

      this.logger.debug(`files at ${this.bucket} ${prefix}: ${fileNames}`);
      return fileNames;
    } catch (error) {
      this.logger.error({ err: error.message }, 'error listing files from storage');
      throw error;
    }
  }

  toPublicURL(path: string) {
    return `${process.env.CDN_ENDPOINT}/${this.bucket}${path}`;
  }
}
