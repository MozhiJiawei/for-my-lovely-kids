import { createHmac, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { extname } from "node:path";

type OssConfig = {
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  endpoint: string;
  prefix: string;
  publicBaseUrl: string;
};

export type UploadPolicy = {
  url: string;
  objectKey: string;
  publicUrl: string;
  formData: Record<string, string>;
};

const defaultObjectStorageEnv = "/etc/red-flower-garden/object-storage.env";
const maxWishImageBytes = 5 * 1024 * 1024;

export function createWishImageUploadPolicy(input: {
  fileName?: string;
  contentType?: string;
  now?: Date;
}): UploadPolicy {
  const config = loadOssConfig();
  const now = input.now ?? new Date();
  const objectKey = createWishImageObjectKey(config.prefix, input.fileName);
  const expiration = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
  const policy = Buffer.from(
    JSON.stringify({
      expiration,
      conditions: [
        ["content-length-range", 1, maxWishImageBytes],
        ["starts-with", "$key", `${config.prefix}images/wishes/`],
        ["eq", "$x-oss-object-acl", "public-read"],
      ],
    }),
  ).toString("base64");
  const signature = createHmac("sha1", config.accessKeySecret).update(policy).digest("base64");

  return {
    url: `https://${config.bucket}.${endpointHost(config.endpoint)}`,
    objectKey,
    publicUrl: `${config.publicBaseUrl.replace(/\/+$/, "")}/${objectKey}`,
    formData: {
      key: objectKey,
      policy,
      OSSAccessKeyId: config.accessKeyId,
      Signature: signature,
      "x-oss-object-acl": "public-read",
      success_action_status: "201",
      ...(input.contentType ? { "Content-Type": input.contentType } : {}),
    },
  };
}

function loadOssConfig(): OssConfig {
  const env = loadObjectStorageEnvFile();
  const endpoint = env.ALIYUN_OSS_ENDPOINT ?? process.env.ALIYUN_OSS_ENDPOINT ?? "";
  const bucket = env.ALIYUN_OSS_BUCKET ?? process.env.ALIYUN_OSS_BUCKET ?? "";
  const publicBaseUrl =
    env.ALIYUN_OSS_PUBLIC_BASE_URL ??
    process.env.ALIYUN_OSS_PUBLIC_BASE_URL ??
    (endpoint && bucket ? `https://${bucket}.${endpointHost(endpoint)}` : "");

  const config = {
    accessKeyId: env.ALIYUN_OSS_ACCESS_KEY_ID ?? process.env.ALIYUN_OSS_ACCESS_KEY_ID ?? "",
    accessKeySecret:
      env.ALIYUN_OSS_ACCESS_KEY_SECRET ?? process.env.ALIYUN_OSS_ACCESS_KEY_SECRET ?? "",
    bucket,
    endpoint,
    prefix: normalizePrefix(env.ALIYUN_OSS_PREFIX ?? process.env.ALIYUN_OSS_PREFIX ?? ""),
    publicBaseUrl,
  };

  if (
    !config.accessKeyId ||
    !config.accessKeySecret ||
    !config.bucket ||
    !config.endpoint ||
    !config.publicBaseUrl
  ) {
    throw new Error("Aliyun OSS image upload is not configured.");
  }

  return config;
}

function loadObjectStorageEnvFile(): Record<string, string> {
  const filePath = process.env.OBJECT_STORAGE_ENV ?? defaultObjectStorageEnv;

  if (!existsSync(filePath)) {
    return {};
  }

  return Object.fromEntries(
    readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        const key = line.slice(0, separator).trim();
        const value = line
          .slice(separator + 1)
          .trim()
          .replace(/^['"]|['"]$/g, "");

        return [key, value];
      }),
  );
}

function createWishImageObjectKey(prefix: string, fileName = ""): string {
  const extension = sanitizeExtension(extname(fileName));

  return `${prefix}images/wishes/${new Date().toISOString().slice(0, 10)}/${randomUUID()}${extension}`;
}

function sanitizeExtension(extension: string): string {
  const normalized = extension.toLowerCase();

  return /^\.(jpg|jpeg|png|webp|gif)$/.test(normalized) ? normalized : ".jpg";
}

function normalizePrefix(prefix: string): string {
  const normalized = prefix.trim() || "red-flower-garden/";

  return normalized.endsWith("/") ? normalized : `${normalized}/`;
}

function endpointHost(endpoint: string): string {
  return endpoint.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}
