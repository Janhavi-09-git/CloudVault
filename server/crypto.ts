import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { config, HttpError } from "./config.js";

export const sha256 = (data: Buffer): string => createHash("sha256").update(data).digest("hex");

export function splitBufferIntoChunks(data: Buffer, chunkSize: number) {
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) throw new RangeError("Chunk size must be a positive integer.");
  const chunkCount = Math.max(1, Math.ceil(data.length / chunkSize));
  return Array.from({ length: chunkCount }, (_, index) => data.subarray(index * chunkSize, Math.min(data.length, (index + 1) * chunkSize)));
}

export function encryptChunk(plain: Buffer) {
  if (!/^[a-fA-F0-9]{64}$/.test(config.encryptionKey)) {
    throw new HttpError(503, "Encryption is unavailable. Configure a 32-byte ENCRYPTION_KEY on the backend.");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(config.encryptionKey, "hex"), iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  return { ciphertext, iv: iv.toString("hex"), tag: cipher.getAuthTag().toString("hex") };
}

export function decryptChunk(ciphertext: Buffer, iv: string, tag: string) {
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(config.encryptionKey, "hex"), Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
