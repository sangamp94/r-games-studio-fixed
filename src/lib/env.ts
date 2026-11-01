import { z } from "zod";

const envSchema = z.object({
  SITE_NAME: z.string().min(1),
  MAIN_DOMAIN_URL: z.string().url(),
  GAMES_DOMAIN_URL: z.string().url(),
  PUBLIC_CDN_BASE_URL: z.string().url(),
  ALLOWED_ORIGINS: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  VISITOR_HASH_SALT: z.string().min(16, "VISITOR_HASH_SALT must be at least 16 characters"),
  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD: z.string().min(12, "ADMIN_PASSWORD must be at least 12 characters"),
  STORAGE_DRIVER: z.enum(["local", "s3"]),
  LOCAL_STORAGE_PATH: z.string().default("./.storage"),
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default("auto"),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET_GAMES: z.string().min(1),
  S3_BUCKET_MEDIA: z.string().min(1),
  S3_BUCKET_TEMP: z.string().min(1),
  MAX_UPLOAD_SIZE_BYTES: z.coerce.number().int().positive().default(524288000),
  MAX_EXTRACTED_SIZE_BYTES: z.coerce.number().int().positive().default(1073741824),
  MAX_SINGLE_FILE_SIZE_BYTES: z.coerce.number().int().positive().default(268435456),
  MAX_FILE_COUNT: z.coerce.number().int().positive().default(2500),
  MAX_COMPRESSION_RATIO: z.coerce.number().positive().default(100),
  PLAYER_LOAD_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_DRIVER: z.enum(["postgres", "redis"]).default("postgres"),
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
});

function parseEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const errors = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid or missing environment variables:\n${errors}`);
  }
  if (
    parsed.data.STORAGE_DRIVER === "s3" &&
    (!parsed.data.S3_ENDPOINT || !parsed.data.S3_ACCESS_KEY_ID || !parsed.data.S3_SECRET_ACCESS_KEY)
  ) {
    throw new Error(
      "STORAGE_DRIVER is set to 's3', but S3_ENDPOINT, S3_ACCESS_KEY_ID, or S3_SECRET_ACCESS_KEY is missing."
    );
  }
  return parsed.data;
}

export const env = parseEnv();
