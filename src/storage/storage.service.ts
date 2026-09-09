import { Injectable } from '@nestjs/common';
import * as AWS from 'aws-sdk';

@Injectable()
export class StorageService {
  private s3: AWS.S3;

  constructor() {
    this.s3 = new AWS.S3({
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_ACCESS_KEY_SECRET,
      region: process.env.S3_REGION,
      endpoint: process.env.S3_ENDPOINT,
      s3ForcePathStyle: true,
      logger: console,
      signatureVersion: "v4"
    });
  }

  async getFiles(bucket: string, prefix: string): Promise<string[]> {
    const params = {
      Bucket: bucket,
      Prefix: prefix,
    };

    try {
      const data = await this.s3.listObjectsV2(params).promise();
      const fileNames = data.Contents.map((file) =>
        file.Key.replace(prefix, ''),
      ).filter((fileName) => fileName !== '');

      return fileNames;
    } catch (error) {
      console.error('Error listing files from S3:', error);
      throw error;
    }
  }
}
