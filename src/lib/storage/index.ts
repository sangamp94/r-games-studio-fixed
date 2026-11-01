import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { env } from "../env";

export type BucketKind = "games" | "media" | "temp";

export interface PutObjectOptions {
  bucket: BucketKind;
  key: string;
  body: Buffer | Uint8Array | Readable;
  contentType: string;
  contentEncoding?: string;
  cacheControl?: string;
  customMetadata?: Record<string, string>;
}

export interface StorageAdapter {
  putObject(options: PutObjectOptions): Promise<void>;
  getObjectStream(bucket: BucketKind, key: string): Promise<Readable>;
  deletePrefix(bucket: BucketKind, prefix: string): Promise<void>;
  createMultipartUpload(bucket: BucketKind, key: string, contentType: string): Promise<string>;
  getPresignedPartUrl(
    bucket: BucketKind,
    key: string,
    uploadId: string,
    partNumber: number
  ): Promise<string>;
  completeMultipartUpload(
    bucket: BucketKind,
    key: string,
    uploadId: string,
    parts: { ETag: string; PartNumber: number }[]
  ): Promise<void>;
  abortMultipartUpload(bucket: BucketKind, key: string, uploadId: string): Promise<void>;
}

function resolveBucketName(bucket: BucketKind): string {
  switch (bucket) {
    case "games":
      return env.S3_BUCKET_GAMES;
    case "media":
      return env.S3_BUCKET_MEDIA;
    case "temp":
      return env.S3_BUCKET_TEMP;
  }
}

class S3StorageAdapter implements StorageAdapter {
  private client: S3Client;

  constructor() {
    this.client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID!,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
      },
    });
  }

  async putObject(options: PutObjectOptions): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: resolveBucketName(options.bucket),
        Key: options.key,
        Body: options.body,
        ContentType: options.contentType,
        ContentEncoding: options.contentEncoding,
        CacheControl: options.cacheControl,
        Metadata: options.customMetadata,
      })
    );
  }

  async getObjectStream(bucket: BucketKind, key: string): Promise<Readable> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: resolveBucketName(bucket),
        Key: key,
      })
    );
    if (!response.Body || !(response.Body instanceof Readable)) {
      throw new Error(`Unable to stream object ${key} from bucket ${bucket}`);
    }
    return response.Body;
  }

  async deletePrefix(bucket: BucketKind, prefix: string): Promise<void> {
    const bucketName = resolveBucketName(bucket);
    let continuationToken: string | undefined;

    do {
      const listResponse = await this.client.send(
        new ListObjectsV2Command({
          Bucket: bucketName,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        })
      );

      const objects = listResponse.Contents ?? [];
      if (objects.length > 0) {
        await this.client.send(
          new DeleteObjectsCommand({
            Bucket: bucketName,
            Delete: {
              Objects: objects.map((obj) => ({ Key: obj.Key! })),
              Quiet: true,
            },
          })
        );
      }
      continuationToken = listResponse.NextContinuationToken;
    } while (continuationToken);
  }

  async createMultipartUpload(
    bucket: BucketKind,
    key: string,
    contentType: string
  ): Promise<string> {
    const res = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: resolveBucketName(bucket),
        Key: key,
        ContentType: contentType,
      })
    );
    if (!res.UploadId) {
      throw new Error("Failed to initialize multipart upload");
    }
    return res.UploadId;
  }

  async getPresignedPartUrl(
    bucket: BucketKind,
    key: string,
    uploadId: string,
    partNumber: number
  ): Promise<string> {
    const command = new UploadPartCommand({
      Bucket: resolveBucketName(bucket),
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
    });
    return getSignedUrl(this.client, command, { expiresIn: 3600 });
  }

  async completeMultipartUpload(
    bucket: BucketKind,
    key: string,
    uploadId: string,
    parts: { ETag: string; PartNumber: number }[]
  ): Promise<void> {
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: resolveBucketName(bucket),
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts },
      })
    );
  }

  async abortMultipartUpload(bucket: BucketKind, key: string, uploadId: string): Promise<void> {
    await this.client.send(
      new AbortMultipartUploadCommand({
        Bucket: resolveBucketName(bucket),
        Key: key,
        UploadId: uploadId,
      })
    );
  }
}

class LocalStorageAdapter implements StorageAdapter {
  private resolveLocalPath(bucket: BucketKind, key: string): string {
    const baseDir = path.resolve(env.LOCAL_STORAGE_PATH, bucket);
    const targetPath = path.resolve(baseDir, key);
    if (!targetPath.startsWith(baseDir)) {
      throw new Error("Path traversal rejected in LocalStorageAdapter");
    }
    return targetPath;
  }

  async putObject(options: PutObjectOptions): Promise<void> {
    const filePath = this.resolveLocalPath(options.bucket, options.key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    if (options.body instanceof Readable) {
      const chunks: Buffer[] = [];
      for await (const chunk of options.body) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      await fs.writeFile(filePath, Buffer.concat(chunks));
    } else {
      await fs.writeFile(filePath, options.body);
    }
  }

  async getObjectStream(bucket: BucketKind, key: string): Promise<Readable> {
    const filePath = this.resolveLocalPath(bucket, key);
    return createReadStream(filePath);
  }

  async deletePrefix(bucket: BucketKind, prefix: string): Promise<void> {
    const targetDir = this.resolveLocalPath(bucket, prefix);
    await fs.rm(targetDir, { recursive: true, force: true });
  }

  async createMultipartUpload(): Promise<string> {
    return crypto.randomUUID();
  }

  async getPresignedPartUrl(): Promise<string> {
    return "";
  }

  async completeMultipartUpload(): Promise<void> {}
  async abortMultipartUpload(): Promise<void> {}
}

export const storage: StorageAdapter =
  env.STORAGE_DRIVER === "s3" ? new S3StorageAdapter() : new LocalStorageAdapter();
