import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { isUploadBucket, processImage } from "@/lib/services/upload.service";

async function makePng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 10, g: 120, b: 200 },
    },
  })
    .png()
    .toBuffer();
}

describe("processImage", () => {
  it("downscales the longest side to 1200px and outputs WebP", async () => {
    const big = await makePng(3000, 2000);
    const { buffer, contentType, ext } = await processImage(big);

    const meta = await sharp(buffer).metadata();
    expect(meta.format).toBe("webp");
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(1200);
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(800); // aspect ratio preserved
    expect(contentType).toBe("image/webp");
    expect(ext).toBe("webp");
  });

  it("does not upscale a small image", async () => {
    const small = await makePng(400, 300);
    const { buffer } = await processImage(small);
    const meta = await sharp(buffer).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(300);
  });

  it("compresses a large image to a smaller payload", async () => {
    const big = await makePng(3000, 2000);
    const { buffer } = await processImage(big);
    expect(buffer.byteLength).toBeLessThan(big.byteLength);
  });
});

describe("isUploadBucket", () => {
  it("accepts known buckets and rejects others", () => {
    expect(isUploadBucket("logos")).toBe(true);
    expect(isUploadBucket("projects")).toBe(true);
    expect(isUploadBucket("avatars")).toBe(false);
  });
});
