import {
  ListObjectsV2Command,
  ListObjectsV2CommandOutput,
  S3Client,
  S3ClientConfig,
} from '@aws-sdk/client-s3';
import { Injectable, Logger } from '@nestjs/common';
import { StoragePath } from './storage.paths';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private client: S3Client;
  private bucket: string;
  private cdnEndpoint: string;

  constructor(configService: ConfigService) {
    this.bucket = configService.getOrThrow('BUCKET_NAME');
    this.cdnEndpoint = configService.getOrThrow('CDN_ENDPOINT');

    const config: S3ClientConfig = {
      region: configService.getOrThrow('S3_REGION'),
      // S3-compatible endpoints (MinIO, etc.) need path-style addressing;
      // AWS S3 accepts it too, so this is safe as a default.
      forcePathStyle: true,
    };

    // Custom endpoint only for non-AWS S3-compatible storage; on AWS we let the
    // SDK derive the regional endpoint.
    const endpoint = configService.get<string>('S3_ENDPOINT');
    if (endpoint) config.endpoint = endpoint;

    // Static keys are optional: when they're absent the SDK's default provider
    // chain resolves credentials automatically (EKS Pod Identity / IRSA in prod).
    const accessKeyId = configService.get<string>('S3_ACCESS_KEY_ID');
    const secretAccessKey = configService.get<string>('S3_ACCESS_KEY_SECRET');
    if (accessKeyId && secretAccessKey) {
      config.credentials = { accessKeyId, secretAccessKey };
    }

    this.client = new S3Client(config);
  }

  async getFiles(prefix: StoragePath): Promise<string[]> {
    try {
      const fileNames: string[] = [];
      let continuationToken: string | undefined;

      // ListObjectsV2 caps each response at 1000 keys, so page until done.
      do {
        const response: ListObjectsV2CommandOutput = await this.client.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          }),
        );

        for (const object of response.Contents ?? []) {
          const fileName = (object.Key ?? '').replace(prefix, '');
          if (fileName !== '') fileNames.push(fileName);
        }

        continuationToken = response.IsTruncated
          ? response.NextContinuationToken
          : undefined;
      } while (continuationToken);

      this.logger.debug(`files at ${this.bucket} ${prefix}: ${fileNames}`);
      return fileNames;
    } catch (error) {
      this.logger.error(
        { err: error.message },
        'error listing files from storage',
      );
      throw error;
    }
  }

  toPublicURL(path: string) {
    return `${this.cdnEndpoint}/${this.bucket}/${path}`;
  }
}
