import { randomUUID } from "node:crypto";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import {
  CreateInvalidationCommand,
  GetDistributionCommand,
} from "@aws-sdk/client-cloudfront";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { config, HttpError, requireServices } from "./config.js";
import { cloudFront, s3 } from "./aws.js";
import { decryptChunk, encryptChunk, sha256, splitBufferIntoChunks } from "./crypto.js";
import { supabase } from "./supabase.js";

export const api = Router();
const requestBytes = new WeakMap<object, number>();
const boundedMemoryStorage: multer.StorageEngine = {
  _handleFile(req, file, callback) {
    const parts: Buffer[] = [];
    let size = 0;
    let completed = false;
    const fail = (error: Error) => {
      if (completed) return;
      completed = true;
      parts.length = 0;
      callback(error);
    };
    file.stream.on("data", (part: Buffer) => {
      if (completed) return;
      size += part.length;
      const requestSize = (requestBytes.get(req) ?? 0) + part.length;
      requestBytes.set(req, requestSize);
      if (requestSize > config.maxUploadBytes) {
        fail(new multer.MulterError("LIMIT_FILE_SIZE"));
        return;
      }
      parts.push(part);
    });
    file.stream.on("limit", () => fail(new multer.MulterError("LIMIT_FILE_SIZE")));
    file.stream.on("error", fail);
    file.stream.on("end", () => {
      if (completed) return;
      completed = true;
      callback(null, { buffer: Buffer.concat(parts, size), size });
    });
  },
  _removeFile(_req, file, callback) {
    const memoryFile = file as { buffer?: Buffer };
    delete memoryFile.buffer;
    callback(null);
  },
};
const upload = multer({
  storage: boundedMemoryStorage,
  limits: { fileSize: config.maxUploadBytes, files: 100, fieldSize: 1024 },
});
const safeName = (name: string) => path.basename(name.replace(/\\/g, "/")).replace(/[^\w.\- ()]/g, "_").slice(0, 180) || "upload";
const recordActivity = async (userId: string, action: string, detail: string) => {
  const { error } = await supabase.from("activity_logs").insert({ user_id: userId, action, detail });
  if (error) console.error("Could not record activity:", error.message);
};

async function verifyCloudFrontSetup() {
  const response = await cloudFront.send(new GetDistributionCommand({ Id: config.cloudFrontDistributionId }));
  const distribution = response.Distribution;
  const distributionConfig = distribution?.DistributionConfig;
  if (!distribution || !distributionConfig?.Enabled || distribution.Status !== "Deployed") {
    throw new HttpError(503, "CloudFront distribution is not enabled and deployed yet.");
  }
  const configuredDomain = config.cloudFrontDomain.replace(/^https?:\/\//, "").replace(/\/$/, "").toLowerCase();
  const distributionDomain = distribution.DomainName?.toLowerCase();
  const aliases = distributionConfig.Aliases?.Items?.map((domain) => domain.toLowerCase()) ?? [];
  const isDefaultDomain = configuredDomain === distributionDomain;
  const hasConfiguredCertificate = Boolean(
    distributionConfig.ViewerCertificate?.ACMCertificateArn ||
    distributionConfig.ViewerCertificate?.IAMCertificateId,
  );
  if (!isDefaultDomain && (!aliases.includes(configuredDomain) || !hasConfiguredCertificate)) {
    throw new HttpError(503, "CLOUDFRONT_DOMAIN must be the distribution hostname or an attached alias with a configured TLS certificate.");
  }
  const hasPrivateBucketOrigin = distributionConfig.Origins?.Items?.some((origin) =>
    origin.DomainName?.toLowerCase().includes(config.bucket.toLowerCase()) &&
    Boolean(origin.OriginAccessControlId),
  );
  if (!hasPrivateBucketOrigin) {
    throw new HttpError(503, "The distribution must use this S3 bucket as an Origin Access Control (OAC) origin.");
  }
  return configuredDomain;
}

api.get("/files", async (req, res, next) => {
  try {
    requireServices("supabase");
    const { data, error } = await supabase.from("files").select("id,name,mime_type,size_bytes,chunk_size_bytes,chunk_count,sha256,encrypted,created_at").eq("user_id", req.userId!).order("created_at", { ascending: false });
    if (error) throw new HttpError(502, `Could not load files: ${error.message}`);
    res.json({ files: data });
  } catch (error) { next(error); }
});

api.get("/activity", async (req, res, next) => {
  try {
    requireServices("supabase");
    const { data, error } = await supabase.from("activity_logs").select("id,action,detail,created_at").eq("user_id", req.userId!).order("created_at", { ascending: false }).limit(20);
    if (error) throw new HttpError(502, `Could not load activity: ${error.message}`);
    res.json({ activity: data });
  } catch (error) { next(error); }
});

api.get("/downloads", async (req, res, next) => {
  try {
    requireServices("supabase");
    const { data, error } = await supabase.from("downloads").select("id,file_name,mode,size_bytes,created_at").eq("user_id", req.userId!).order("created_at", { ascending: false }).limit(100);
    if (error) throw new HttpError(502, `Could not load downloads: ${error.message}`);
    res.json({ downloads: data });
  } catch (error) { next(error); }
});

api.post("/files", upload.single("file"), async (req, res, next) => {
  const uploadedKeys: string[] = [];
  try {
    requireServices("supabase", "storage", "encryption");
    const file = req.file;
    if (!file) throw new HttpError(400, "Choose a file to upload.");
    const chunkSizeMb = Number(req.body.chunkSizeMb ?? 1);
    if (!Number.isInteger(chunkSizeMb) || chunkSizeMb < 1 || chunkSizeMb > 8) {
      throw new HttpError(400, "Chunk size must be a whole number between 1 and 8 MB.");
    }
    const userId = req.userId!;
    const fileId = randomUUID();
    const chunkSize = chunkSizeMb * 1024 * 1024;
    const plainChunks = splitBufferIntoChunks(file.buffer, chunkSize);
    const chunkCount = plainChunks.length;
    const chunks = [];
    for (let index = 0; index < chunkCount; index++) {
      const plain = plainChunks[index];
      const encrypted = encryptChunk(plain);
      const key = `files/${userId}/${fileId}/chunk-${String(index).padStart(6, "0")}.bin`;
      await s3.send(new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: encrypted.ciphertext,
        ContentType: "application/octet-stream",
        ServerSideEncryption: "AES256",
      }));
      uploadedKeys.push(key);
      chunks.push({
        file_id: fileId,
        user_id: userId,
        chunk_index: index,
        object_key: key,
        size_bytes: plain.length,
        sha256: sha256(plain),
        encrypted_size_bytes: encrypted.ciphertext.length,
        encrypted_sha256: sha256(encrypted.ciphertext),
        iv: encrypted.iv,
        auth_tag: encrypted.tag,
      });
    }
    const { error: fileError } = await supabase.from("files").insert({
      id: fileId,
      user_id: userId,
      name: safeName(file.originalname),
      mime_type: file.mimetype || "application/octet-stream",
      size_bytes: file.size,
      chunk_size_bytes: chunkSize,
      chunk_count: chunkCount,
      sha256: sha256(file.buffer),
      encrypted: true,
    });
    if (fileError) throw new HttpError(502, `File metadata could not be saved: ${fileError.message}`);
    const { error: chunksError } = await supabase.from("file_chunks").insert(chunks);
    if (chunksError) {
      await supabase.from("files").delete().eq("id", fileId).eq("user_id", userId);
      throw new HttpError(502, `Chunk metadata could not be saved: ${chunksError.message}`);
    }
    await recordActivity(userId, "file.uploaded", `Uploaded and encrypted ${safeName(file.originalname)} (${chunkCount} chunk${chunkCount === 1 ? "" : "s"}).`);
    res.status(201).json({ id: fileId, name: safeName(file.originalname), sizeBytes: file.size, chunkCount, sha256: sha256(file.buffer) });
  } catch (error) {
    if (uploadedKeys.length) {
      try {
        await s3.send(new DeleteObjectsCommand({ Bucket: config.bucket, Delete: { Objects: uploadedKeys.map((Key) => ({ Key })) } }));
      } catch (cleanupError) {
        console.error("Failed to clean up uncommitted S3 chunks:", cleanupError);
      }
    }
    next(error);
  }
});

api.get("/files/:id/chunks", async (req, res, next) => {
  try {
    requireServices("supabase");
    const { data: file, error: fileError } = await supabase.from("files").select("id").eq("id", req.params.id).eq("user_id", req.userId!).maybeSingle();
    if (fileError) throw new HttpError(502, `Could not load file: ${fileError.message}`);
    if (!file) throw new HttpError(404, "File not found.");
    const { data, error } = await supabase.from("file_chunks").select("chunk_index,size_bytes,sha256,encrypted_size_bytes,encrypted_sha256").eq("file_id", req.params.id).eq("user_id", req.userId!).order("chunk_index");
    if (error) throw new HttpError(502, `Could not load chunk details: ${error.message}`);
    res.json({ chunks: data });
  } catch (error) { next(error); }
});

api.get("/files/:id/download", async (req, res, next) => {
  try {
    requireServices("supabase", "storage", "encryption");
    const mode = req.query.mode === "encrypted" ? "encrypted" : req.query.mode === "original" ? "original" : null;
    if (!mode) throw new HttpError(400, "Choose download mode 'encrypted' or 'original'.");
    const userId = req.userId!;
    const { data: file, error: fileError } = await supabase.from("files").select("id,name,mime_type,size_bytes,sha256").eq("id", req.params.id).eq("user_id", userId).maybeSingle();
    if (fileError) throw new HttpError(502, `Could not load file: ${fileError.message}`);
    if (!file) throw new HttpError(404, "File not found.");
    const { data: chunks, error: chunksError } = await supabase.from("file_chunks").select("chunk_index,object_key,sha256,encrypted_sha256,iv,auth_tag").eq("file_id", file.id).eq("user_id", userId).order("chunk_index");
    if (chunksError) throw new HttpError(502, `Could not load file chunks: ${chunksError.message}`);
    if (!chunks?.length) throw new HttpError(409, "This file has no stored chunks.");
    const payload = [];
    for (const chunk of chunks) {
      const response = await s3.send(new GetObjectCommand({ Bucket: config.bucket, Key: chunk.object_key }));
      if (!response.Body) throw new HttpError(502, "A stored chunk had no data.");
      const encrypted = Buffer.from(await response.Body.transformToByteArray());
      if (sha256(encrypted) !== chunk.encrypted_sha256) throw new HttpError(409, `Integrity check failed for encrypted chunk ${chunk.chunk_index}.`);
      const plain = decryptChunk(encrypted, chunk.iv, chunk.auth_tag);
      if (sha256(plain) !== chunk.sha256) throw new HttpError(409, `Integrity check failed for chunk ${chunk.chunk_index}.`);
      payload.push({ chunk, encrypted, plain });
    }
    const bytes = mode === "original"
      ? Buffer.concat(payload.map(({ plain }) => plain))
      : Buffer.from(JSON.stringify({
        format: "cloudvault-encrypted-v1",
        algorithm: "AES-256-GCM",
        fileName: file.name,
        chunks: payload.map(({ chunk, encrypted }) => ({
          index: chunk.chunk_index,
          iv: chunk.iv,
          authTag: chunk.auth_tag,
          sha256: chunk.encrypted_sha256,
          dataBase64: encrypted.toString("base64"),
        })),
      }));
    if (mode === "original" && sha256(bytes) !== file.sha256) throw new HttpError(409, "The reconstructed file checksum does not match the original.");
    const downloadName = mode === "original" ? file.name : `${file.name}.encrypted.json`;
    const { error: downloadError } = await supabase.from("downloads").insert({ user_id: userId, file_id: file.id, file_name: file.name, mode, size_bytes: bytes.length });
    if (downloadError) throw new HttpError(502, `Download history could not be saved: ${downloadError.message}`);
    await recordActivity(userId, `file.downloaded.${mode}`, `Downloaded ${file.name} (${mode}).`);
    res.setHeader("Content-Type", mode === "original" ? file.mime_type : "application/json");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`);
    res.setHeader("Content-Length", bytes.length);
    res.send(bytes);
  } catch (error) { next(error); }
});

api.get("/deployments", async (req, res, next) => {
  try {
    requireServices("supabase");
    const { data, error } = await supabase.from("deployments").select("id,kind,name,status,published_url,cdn_invalidation_id,created_at").eq("user_id", req.userId!).order("created_at", { ascending: false }).limit(100);
    if (error) throw new HttpError(502, `Could not load deployments: ${error.message}`);
    res.json({ deployments: data });
  } catch (error) { next(error); }
});

const allowedWebsiteExtensions = new Set([".html", ".htm", ".css", ".js", ".mjs", ".json", ".svg", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".woff", ".woff2", ".txt", ".xml", ".pdf"]);
api.post("/deployments/:kind", upload.array("files", 100), async (req, res, next) => {
  const uploadedKeys: string[] = [];
  let deploymentSaved = false;
  try {
    requireServices("supabase", "storage", "cdn");
    const kind = req.params.kind;
    if (kind !== "portfolio" && kind !== "documentation") throw new HttpError(400, "Deployment type must be portfolio or documentation.");
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files?.length) throw new HttpError(400, "Choose website files to publish.");
    const normalized = files.map((file) => {
      const relative = String(file.originalname).replace(/\\/g, "/").replace(/^\/+/, "");
      const parts = relative.split("/");
      if (parts.some((part) => !part || part === "." || part === "..")) throw new HttpError(400, "Website file paths cannot contain empty, current, or parent directory segments.");
      if (!allowedWebsiteExtensions.has(path.extname(relative).toLowerCase())) throw new HttpError(400, `Unsupported website file type: ${path.extname(relative) || "(no extension)"}.`);
      return { file, relative };
    });
    if (!normalized.some(({ relative }) => relative.toLowerCase() === "index.html")) {
      throw new HttpError(400, "The website needs an index.html file at its root.");
    }
    const publishedDomain = await verifyCloudFrontSetup();
    const userId = req.userId!;
    const deploymentId = randomUUID();
    const prefix = `sites/${kind}/${userId}/${deploymentId}`;
    for (const { file, relative } of normalized) {
      const key = `${prefix}/${relative}`;
      await s3.send(new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype || "application/octet-stream",
        ServerSideEncryption: "AES256",
        CacheControl: "public, max-age=300",
      }));
      uploadedKeys.push(key);
    }
    const name = String(req.body.name ?? (kind === "portfolio" ? "Portfolio site" : "Documentation site")).trim().slice(0, 100) || `${kind} site`;
    const publishedUrl = `https://${publishedDomain}/${prefix}/index.html`;
    const { error: insertError } = await supabase.from("deployments").insert({
      id: deploymentId, user_id: userId, kind, name, status: "uploaded",
      published_url: publishedUrl, object_prefix: prefix, file_count: normalized.length,
    });
    if (insertError) throw new HttpError(502, `Website metadata could not be saved: ${insertError.message}`);
    deploymentSaved = true;
    let invalidationId: string | undefined;
    try {
      const invalidation = await cloudFront.send(new CreateInvalidationCommand({
        DistributionId: config.cloudFrontDistributionId,
        InvalidationBatch: {
          CallerReference: deploymentId,
          Paths: { Quantity: 1, Items: [`/${prefix}/*`] },
        },
      }));
      invalidationId = invalidation.Invalidation?.Id;
      const { error: updateError } = await supabase.from("deployments").update({
        status: "published", cdn_invalidation_id: invalidationId ?? null,
      }).eq("id", deploymentId).eq("user_id", userId);
      if (updateError) throw new HttpError(502, `Website was uploaded but deployment status could not be saved: ${updateError.message}`);
    } catch (error) {
      if (error instanceof HttpError) throw error;
      console.error("CloudFront invalidation failed:", error);
      throw new HttpError(502, `Website files were uploaded, but CloudFront invalidation failed. Deployment ${deploymentId} is recorded as uploaded; check CloudFront permissions and retry after configuration.`);
    }
    await recordActivity(userId, "site.published", `Published ${name} to CloudFront.`);
    res.status(201).json({ id: deploymentId, name, status: "published", publishedUrl, fileCount: normalized.length, invalidationId });
  } catch (error) {
    if (uploadedKeys.length && !deploymentSaved) {
      try {
        await s3.send(new DeleteObjectsCommand({ Bucket: config.bucket, Delete: { Objects: uploadedKeys.map((Key) => ({ Key })) } }));
      } catch (cleanupError) {
        console.error("Failed to clean up website objects:", cleanupError);
      }
    }
    next(error);
  }
});

api.post("/deployments/:id/invalidate", async (req, res, next) => {
  try {
    requireServices("supabase", "cdn");
    const { data: deployment, error } = await supabase.from("deployments").select("id,object_prefix").eq("id", req.params.id).eq("user_id", req.userId!).maybeSingle();
    if (error) throw new HttpError(502, `Could not load deployment: ${error.message}`);
    if (!deployment) throw new HttpError(404, "Deployment not found.");
    const invalidation = await cloudFront.send(new CreateInvalidationCommand({
      DistributionId: config.cloudFrontDistributionId,
      InvalidationBatch: {
        CallerReference: randomUUID(),
        Paths: { Quantity: 1, Items: [`/${deployment.object_prefix}/*`] },
      },
    }));
    const { error: updateError } = await supabase.from("deployments").update({
      cdn_invalidation_id: invalidation.Invalidation?.Id ?? null,
    }).eq("id", deployment.id).eq("user_id", req.userId!);
    if (updateError) throw new HttpError(502, `Invalidation was requested but its metadata could not be saved: ${updateError.message}`);
    await recordActivity(req.userId!, "cdn.invalidated", `Requested CDN cache invalidation for deployment ${deployment.id}.`);
    res.json({ invalidationId: invalidation.Invalidation?.Id, status: invalidation.Invalidation?.Status ?? "InProgress" });
  } catch (error) { next(error); }
});
