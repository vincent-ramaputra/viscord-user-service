import { Storage } from '@google-cloud/storage';
import { Injectable } from '@nestjs/common';
import { StoragePath } from './storage.paths';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class StorageService {
  private client: Storage;
  private bucket: string;

  constructor(configService: ConfigService) {
    this.client = new Storage();
    this.bucket = configService.getOrThrow('AWS_BUCKET');
  }

  async getFiles(prefix: StoragePath): Promise<string[]> {
    try {
      const [files] = await this.client
        .bucket(this.bucket)
        .getFiles({ prefix });

      const fileNames = files
        .map((file) => file.name.replace(prefix, ''))
        .filter((fileName) => fileName !== '');

      console.log(`Files at ${this.bucket} ${prefix}: ${fileNames}`);
      return fileNames;
    } catch (error) {
      console.error('Error listing files from S3:', error);
      throw error;
    }
  }

  toPublicURL(path: string) {
    return `${process.env.CDN_ENDPOINT}/${this.bucket}/${path}`;
  }
}
