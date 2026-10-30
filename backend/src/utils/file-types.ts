import crypto from "crypto";
import fs from "fs";
import path from "path";
import { HttpError } from "./http-error";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

export type ImageExtension = "jpg" | "png";

/**
 * Detect a real image type from the file contents instead of trusting the
 * client-provided mimetype or filename.
 */
export const detectImageExtension = (buffer: Buffer): ImageExtension | null => {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpg";
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return "png";
  }
  return null;
};

/** XLSX files are ZIP archives; verify the magic bytes before parsing them. */
export const isZipBuffer = (buffer: Buffer): boolean =>
  buffer.length >= 4 && buffer.subarray(0, 4).equals(ZIP_SIGNATURE);

export const assertImageBuffer = (buffer: Buffer): ImageExtension => {
  const extension = detectImageExtension(buffer);
  if (!extension) {
    throw new HttpError("File harus berupa gambar JPG atau PNG yang valid", 400);
  }
  return extension;
};

export const assertXlsxBuffer = (buffer: Buffer): void => {
  if (!isZipBuffer(buffer)) {
    throw new HttpError("File harus berupa file Excel (.xlsx) yang valid", 400);
  }
};

export const saveImageBuffer = async (
  buffer: Buffer,
  destinationDir: string
): Promise<string> => {
  const extension = assertImageBuffer(buffer);
  const resolvedDir = path.resolve(destinationDir);
  await fs.promises.mkdir(resolvedDir, { recursive: true });

  const filename = `${crypto.randomUUID()}.${extension}`;
  const target = path.join(resolvedDir, filename);
  await fs.promises.writeFile(target, buffer, { flag: "wx" });
  return filename;
};
