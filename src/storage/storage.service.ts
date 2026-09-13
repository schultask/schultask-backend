import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';
import type { Readable } from 'stream';
import { MINIO_CLIENT } from './storage.constants';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly bucket: string;

  constructor(
    @Inject(MINIO_CLIENT) private readonly minio: Client,
    private readonly config: ConfigService,
  ) {
    this.bucket = this.config.get<string>('MINIO_BUCKET', 'schultask');
  }

  // Bucket-ensure on boot rather than per-request: putObject would otherwise
  // fail on a fresh MinIO instance until someone manually creates the bucket.
  async onModuleInit() {
    const exists = await this.minio.bucketExists(this.bucket).catch(() => false);
    if (!exists) {
      await this.minio.makeBucket(this.bucket);
      this.logger.log(`Created MinIO bucket "${this.bucket}"`);
    }
  }

  async putObject(key: string, buffer: Buffer, contentType: string): Promise<void> {
    await this.minio.putObject(this.bucket, key, buffer, buffer.length, {
      'Content-Type': contentType,
    });
  }

  async getObjectStream(key: string): Promise<Readable> {
    return this.minio.getObject(this.bucket, key);
  }

  // Content-Type must come from MinIO's stored metadata (set at upload time
  // from the validated multer mimetype), never from the object key's file
  // extension — the key is built from the client-supplied filename, so
  // deriving type from it would let an uploaded `payload.html` (accepted
  // because its declared mimetype passed the image/* filter) get served
  // back as text/html.
  async getContentType(key: string): Promise<string> {
    const stat = await this.minio.statObject(this.bucket, key);
    return (stat.metaData['content-type'] as string | undefined) ?? 'application/octet-stream';
  }

  async deleteObject(key: string): Promise<void> {
    await this.minio.removeObject(this.bucket, key);
  }
}
