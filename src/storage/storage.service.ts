import { Storage } from '@google-cloud/storage';
import { Injectable } from '@nestjs/common';

@Injectable()
export class StorageService {
  private client: Storage;

  constructor() {
    this.client = new Storage();
  }

  async getFiles(bucket: string, prefix: string): Promise<string[]> {
    try {
      const [files] = await this.client.bucket(bucket).getFiles({ prefix });

      const fileNames = files
        .map((file) => file.name.replace(prefix, ''))
        .filter((fileName) => fileName !== '');

      return fileNames;
    } catch (error) {
      console.error('Error listing files from S3:', error);
      throw error;
    }
  }
}
