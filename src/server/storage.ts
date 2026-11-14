import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export function safeFilename(value: string) {
  return value.split(/[\\/]/).at(-1)!.replace(/[^a-zA-Z0-9._ -]/g, "_").replace(/^\.+/, "").slice(0, 160).trim() || "document";
}
let client: S3Client | undefined;
function storage() {
  if (!process.env.AWS_ENDPOINT_URL_S3 || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) throw new Error("Storage is not configured");
  return client ??= new S3Client({ forcePathStyle: true });
}
const bucket = () => process.env.DOCUMENTS_BUCKET || "documents";
export async function uploadDocument(workspaceId: string, file: File) {
  const filename = safeFilename(file.name);
  const key = `${workspaceId}/${crypto.randomUUID()}/${filename}`;
  const contentType = file.type || "application/octet-stream";
  await storage().send(new PutObjectCommand({ Bucket: bucket(), Key: key,
    Body: new Uint8Array(await file.arrayBuffer()), ContentType: contentType }));
  return { key, filename, contentType };
}
export async function deleteDocument(key: string) {
  await storage().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}
export async function downloadDocument(key: string, filename: string) {
  const object = await storage().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  if (!object.Body) throw new Error("Document body unavailable");
  return new Response(object.Body.transformToWebStream(), { headers: {
    "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="${safeFilename(filename)}"`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    ...(object.ContentLength === undefined ? {} : { "Content-Length": String(object.ContentLength) }),
  } });
}
