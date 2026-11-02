import "dotenv/config";

const present = (value: string | undefined): boolean => Boolean(value?.trim());

export const config = {
  port: Number(process.env.PORT ?? 4000),
  maxUploadBytes: Number(process.env.MAX_UPLOAD_MB ?? 100) * 1024 * 1024,
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  awsRegion: process.env.AWS_REGION ?? "",
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
  bucket: process.env.S3_BUCKET ?? "",
  encryptionKey: process.env.ENCRYPTION_KEY ?? "",
  cloudFrontDistributionId: process.env.CLOUDFRONT_DISTRIBUTION_ID ?? "",
  cloudFrontDomain: process.env.CLOUDFRONT_DOMAIN ?? "",
};

export const serviceStatus = () => ({
  supabase: present(config.supabaseUrl) && present(config.supabaseServiceRoleKey),
  storage: present(config.awsRegion) && present(config.bucket),
  encryption: /^[a-fA-F0-9]{64}$/.test(config.encryptionKey),
  cdn: present(config.cloudFrontDistributionId) && present(config.cloudFrontDomain),
});

export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export function requireServices(...services: Array<keyof ReturnType<typeof serviceStatus>>) {
  const status = serviceStatus();
  const missing = services.filter((service) => !status[service]);
  if (missing.length) {
    throw new HttpError(503, `Configure ${missing.join(", ")} in the backend environment to use this feature.`);
  }
}
