import { S3Client } from "@aws-sdk/client-s3";
import { CloudFrontClient } from "@aws-sdk/client-cloudfront";
import { config } from "./config.js";

const credentials = config.awsAccessKeyId && config.awsSecretAccessKey
  ? { accessKeyId: config.awsAccessKeyId, secretAccessKey: config.awsSecretAccessKey }
  : undefined;

export const s3 = new S3Client({ region: config.awsRegion || "us-east-1", credentials });
export const cloudFront = new CloudFrontClient({ region: config.awsRegion || "us-east-1", credentials });
