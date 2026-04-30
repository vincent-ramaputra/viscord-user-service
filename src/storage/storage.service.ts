import { ListObjectsCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';

@Injectable()
export class StorageService {
  private s3: S3Client;

  constructor() {
    this.s3 = new S3Client({
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_ACCESS_KEY_SECRET,
      },
      region: process.env.AWS_REGION,
      endpoint: process.env.STORAGE_ENDPOINT,
      forcePathStyle: true,
      logger: console,
    });

    this.s3.middlewareStack.add(
      (next, context) => async (args) => {
        console.log(context);
        console.log('Request Input:', args.input); // View request parameters
        const result = await next(args);
        console.log('Response Output:', result.output); // View raw response
        return result;
      },
      { name: 'MyDebugLogger', step: 'build' },
    );
  }

  async getFiles(bucket: string, prefix: string): Promise<string[]> {
    const command = new ListObjectsCommand({
      Bucket: bucket,
      Prefix: prefix,
    });
    try {
      const data = await this.s3.send(command);

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
