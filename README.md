# CloudVault

CloudVault is a teaching-oriented cloud storage and static-site publishing app. It uses a React + TypeScript frontend, an Express API, Supabase Auth/PostgreSQL, private Amazon S3 objects, AES-256-GCM encryption, and Amazon CloudFront.

> Cloud operations are real AWS/Supabase API calls. The preview screen is an empty UI preview; it does not create sample records or report successful operations. HTTPS delivery depends on a deployed CloudFront distribution and its actual certificate/viewer settings.

## Requirements

- Node.js 20 or newer and npm
- A Supabase project
- An AWS account with an S3 bucket and an optional CloudFront distribution

## Install and run

```powershell
npm install
Copy-Item .env.example .env
# Edit .env with your project and AWS settings.
npm run dev
```

The Vite app runs at `http://localhost:5173` and proxies `/api` requests to the Express API at `http://localhost:4000`. In production, build the frontend with `npm run build` and deploy the static `dist` directory and API separately. Configure `CLIENT_ORIGIN` on the API for the production frontend origin.

## Environment variables

Copy `.env.example` to `.env`. The backend reads `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, AWS settings, `S3_BUCKET`, `ENCRYPTION_KEY`, and CloudFront settings. The browser bundle only reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; never put a service-role key, AWS key, or encryption key in a `VITE_` variable.

| Variable | Required for | Notes |
| --- | --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Browser sign-in | Supabase public project URL and anon/publishable key |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | API authentication and metadata | Service-role key is server-only and bypasses RLS; API queries explicitly filter by authenticated user ID |
| `AWS_REGION`, `S3_BUCKET` | S3 storage | Create a private bucket in this region |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | AWS access | Use an IAM role in hosted environments instead of static credentials |
| `ENCRYPTION_KEY` | File encryption/decryption | Exactly 32 random bytes represented by 64 hexadecimal characters |
| `CLOUDFRONT_DISTRIBUTION_ID`, `CLOUDFRONT_DOMAIN` | Static-site publishing/CDN invalidation | Domain can be the distribution hostname or an attached alternate domain |
| `PORT` | API listener | Defaults to `4000` |
| `MAX_UPLOAD_MB` | Aggregate multipart request cap | Defaults to `100`; uploaded request data is held in memory, so tune this to available API memory |
| `CLIENT_ORIGIN` | Production CORS | Comma-separated frontend origins; omit in local development |

Generate an encryption key once and store it in a secret manager or protected environment variable:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Keep a secure backup of the key. Losing it makes existing encrypted chunks unrecoverable. Do not rotate it without a key-version/migration plan.

## Supabase setup

1. Create a Supabase project.
2. Copy the project URL and anon/publishable key into the two `VITE_` variables; set the same project URL and the server-only service-role key in the backend variables.
3. In Supabase **SQL Editor**, run [`supabase/schema.sql`](./supabase/schema.sql).
4. Configure Auth email confirmation and allowed redirect URLs for your local/production origins.
5. Register through the CloudVault sign-in screen. The Express API verifies each bearer token with Supabase Auth and scopes every database query to that authenticated user.

Row Level Security policies allow authenticated users to read only their own rows. Mutations are made by the API using the service role and include explicit `user_id` ownership filters. Never expose the service-role key to clients.

## AWS S3 setup

1. Create a bucket in `AWS_REGION`, with **Block all public access** enabled and ACLs disabled.
2. Set `S3_BUCKET` to its name. Configure backend access through an IAM role (recommended) or a dedicated IAM user.
3. Grant the API role only the necessary permissions for `s3:PutObject`, `s3:GetObject`, and `s3:DeleteObject` on the bucket's `files/*` and `sites/*` prefixes. `s3:ListBucket` is not used by the API.
4. The app does not set public object ACLs. Uploaded file chunks and site objects use S3 Server-Side Encryption (`AES256`) in addition to application-level encryption for user files.

Uploads currently use bounded Express memory storage and are capped by `MAX_UPLOAD_MB` per request (including an entire static website folder); this is appropriate for a classroom demo, not unbounded production uploads. A production large-file service should use a streaming/multipart design and stronger rate limiting.

## CloudFront and static hosting

The CloudFront distribution must use the same S3 bucket as an origin, use Origin Access Control (OAC), and grant that distribution access through the bucket policy. Keep S3 public access blocked. Set `CLOUDFRONT_DISTRIBUTION_ID` and `CLOUDFRONT_DOMAIN` on the API. The API checks that the distribution is deployed, its domain matches, a custom alias has a certificate, and a matching S3 OAC origin exists before publishing a site. Grant the API role `cloudfront:GetDistribution` and `cloudfront:CreateInvalidation` for the distribution.

The portfolio and documentation forms upload a folder tree containing a root `index.html`. The app writes it under `sites/{kind}/{user-id}/{deployment-id}/` and creates a real CloudFront invalidation for that prefix. The resulting URL is served through the configured distribution domain. The CDN page can also submit an invalidation for an existing deployment.

The API reports CloudFront as configured only when the required environment values exist; successful publishing/invalidation also requires valid AWS credentials, a deployed distribution, the correct origin and domain, and IAM permissions. A failed AWS call is reported as an error; an upload whose invalidation fails is retained with `uploaded` status so it is not presented as published.

### HTTPS and custom domains

CloudVault does not infer that a domain has a valid TLS certificate merely because it begins with `https://`. For a custom domain:

1. Request or import an ACM certificate in **US East (N. Virginia), `us-east-1`**.
2. Validate certificate ownership in DNS.
3. Add the domain as a CloudFront alternate domain name and attach the ACM certificate.
4. Configure the viewer protocol policy to redirect HTTP to HTTPS.
5. Point your DNS record to the CloudFront distribution and verify the certificate and redirect in a browser.

The app displays a setup note rather than claiming that a certificate or custom-domain HTTPS configuration is active. For the default `*.cloudfront.net` distribution hostname, CloudFront provides its managed TLS certificate.

## API overview

All routes below (except `GET /api/health`) require `Authorization: Bearer <Supabase access token>`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Return which backend integrations have required environment configuration; it does not test credentials |
| `GET` | `/api/files` | List the signed-in user's file metadata |
| `POST` | `/api/files` | Multipart file upload (`file`, `chunkSizeMb`); segments, encrypts, stores, and records chunks |
| `GET` | `/api/files/:id/chunks` | Return owner-scoped chunk sizes and SHA-256 checksums |
| `GET` | `/api/files/:id/download?mode=encrypted\|original` | Download an encrypted JSON chunk envelope or checksum-verified reconstructed original |
| `GET` | `/api/downloads` | List recent download records |
| `GET` | `/api/deployments` | List owner-scoped website deployments |
| `POST` | `/api/deployments/portfolio` | Multipart static-site upload and CloudFront invalidation |
| `POST` | `/api/deployments/documentation` | Multipart docs-site upload and CloudFront invalidation |
| `POST` | `/api/deployments/:id/invalidate` | Invalidate a deployment's CloudFront cache |
| `GET` | `/api/activity` | List recent user activity |

Errors use a non-2xx HTTP status and a JSON `{ "error": "..." }` body. The encrypted file option is a JSON envelope with ciphertext chunks, IVs, GCM tags, and ciphertext hashes; it does not contain the decryption key.

## Architecture and workflows

```text
Browser (React + Supabase Auth)
          │ Supabase access token
          ▼
Express API ─────── Supabase Auth / PostgreSQL metadata
     │
     ├── SHA-256 → AES-256-GCM per chunk → private S3 objects
     ├── verify/decrypt → reconstruct original → download
     └── publish website files → private S3 prefix → CloudFront invalidation
                                                          │
                                                          ▼
                                               CloudFront edge locations
```

Chunking lets the app verify and encrypt parts independently; AES-GCM authenticates each chunk; SHA-256 detects unexpected changes; S3 stores private durable objects; CloudFront caches static site assets near viewers. Cache invalidation asks CloudFront to evict selected cached paths. HTTPS/TLS protects delivery in transit when the distribution is configured with the appropriate certificate and viewer policy.

## Tests and build

```powershell
npm test
npm run typecheck:server
npm run build
```

`npm test` runs the local Vitest suite. Cloud integration checks require your own configured Supabase/AWS resources and are not simulated.
