import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  MAX_VIDEO_UPLOAD_BYTES,
  isUploadBucket,
  passthroughVideo,
  processImage,
  sniffVideoMime,
  upload,
} from "@/lib/services/upload.service";

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

// ── Video container validation ───────────────────────────────────────────────
//
// Regression: video used to be stored byte-for-byte under whatever Content-Type
// the CLIENT put on the multipart part. Images can lie and still be caught,
// because sharp decodes and re-encodes them — a non-image simply fails. Video
// had no equivalent step, so the declared type was a label, not a check, and any
// bytes at all could be parked in a public bucket as `video/mp4`.

/** A minimal but structurally real ISO-BMFF header: size, `ftyp`, brand. */
function isoVideo(brand: string, trailer = "moov data"): Buffer {
  return Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x20]),
    Buffer.from("ftyp", "latin1"),
    Buffer.from(brand, "latin1"),
    Buffer.from(trailer, "latin1"),
  ]);
}

/** EBML magic followed by a DocType string, as WebM and Matroska both emit. */
function ebmlVideo(docType: string): Buffer {
  return Buffer.concat([
    Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
    Buffer.from([0x01, 0x00, 0x00, 0x00]),
    Buffer.from(`B${docType}`, "latin1"),
    Buffer.alloc(32),
  ]);
}

describe("sniffVideoMime", () => {
  it.each([
    ["isom", "video/mp4"],
    ["mp42", "video/mp4"],
    ["avc1", "video/mp4"],
    ["M4V ", "video/mp4"],
    ["qt  ", "video/quicktime"],
  ])("identifies ISO brand %s as %s", (brand, expected) => {
    expect(sniffVideoMime(isoVideo(brand))).toBe(expected);
  });

  it("identifies a WebM container from its EBML DocType", () => {
    expect(sniffVideoMime(ebmlVideo("webm"))).toBe("video/webm");
  });

  it("rejects Matroska — the browser cannot play it, so accepting it would upload fine and never play", () => {
    expect(sniffVideoMime(ebmlVideo("matroska"))).toBeNull();
  });

  it.each([
    ["HTML disguised as video", Buffer.from("<html><script>alert(1)</script></html>")],
    ["a PNG", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])],
    ["a ZIP", Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0, 0, 0, 0, 0])],
    ["an ELF binary", Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0, 0, 0, 0, 0, 0, 0, 0])],
    ["plain text", Buffer.from("this is definitely not a video file at all")],
    ["empty", Buffer.alloc(0)],
    ["truncated ftyp", Buffer.from([0, 0, 0, 0x20, 0x66, 0x74, 0x79])],
    ["an unknown ISO brand", isoVideo("XXXX")],
  ])("rejects %s", (_label, buf) => {
    expect(sniffVideoMime(buf)).toBeNull();
  });
});

describe("passthroughVideo", () => {
  it("stores the buffer unmodified and derives the extension from the CONTAINER", async () => {
    const input = isoVideo("isom");
    const mp4 = await passthroughVideo(input);
    expect(mp4.buffer).toBe(input);
    expect(mp4.contentType).toBe("video/mp4");
    expect(mp4.ext).toBe("mp4");

    expect((await passthroughVideo(ebmlVideo("webm"))).ext).toBe("webm");
    expect((await passthroughVideo(isoVideo("qt  "))).ext).toBe("mov");
  });

  it("stores a mislabelled but GENUINE video under its real type rather than rejecting it", async () => {
    // A phone that uploads a real WebM while labelling it video/mp4 is a
    // mislabelled real video, not an attack — the bytes decide the stored type.
    const real = await passthroughVideo(ebmlVideo("webm"));
    expect(real.contentType).toBe("video/webm");
    expect(real.ext).toBe("webm");
  });

  it.each([
    ["a fake MP4 (right label, wrong bytes)", Buffer.from("MP4 honest, I promise. Definitely.")],
    ["an HTML file", Buffer.from("<!doctype html><body>hi</body>")],
    ["an empty file", Buffer.alloc(0)],
    ["random bytes", Buffer.from([0xde, 0xad, 0xbe, 0xef, 0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77])],
  ])("refuses %s", async (_label, buf) => {
    await expect(passthroughVideo(buf)).rejects.toThrow(/Unsupported or corrupted video/i);
  });
});

// ── The whole upload path, end to end ────────────────────────────────────────
// STORAGE_DRIVER=local writes to the filesystem, so this exercises validate ->
// sniff/decode -> store without Supabase or a network. That matters: the size
// and bucket rules live in a private validate() and are only reachable through
// upload(), which is exactly the seam an attacker would come through.
describe("upload() end to end", () => {
  let dir = "";
  const prev: Record<string, string | undefined> = {};

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "alassema-upload-"));
    prev.STORAGE_DRIVER = process.env.STORAGE_DRIVER;
    prev.UPLOADS_DIR = process.env.UPLOADS_DIR;
    prev.PUBLIC_UPLOADS_BASE_URL = process.env.PUBLIC_UPLOADS_BASE_URL;
    process.env.STORAGE_DRIVER = "local";
    process.env.UPLOADS_DIR = dir;
    process.env.PUBLIC_UPLOADS_BASE_URL = "https://cdn.test/uploads";
  });

  afterAll(() => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  const asFile = (buf: Buffer, name: string, type: string) =>
    new File([new Uint8Array(buf)], name, { type });

  it("accepts a genuine MP4 into the gallery and stores it as .mp4", async () => {
    const { url } = await upload(asFile(isoVideo("isom"), "clip.mp4", "video/mp4"), "gallery");
    expect(url).toMatch(/^https:\/\/cdn\.test\/uploads\/gallery\/[0-9a-f-]+\.mp4$/);
    expect(readdirSync(join(dir, "gallery")).length).toBeGreaterThan(0);
  });

  it("stores under a RANDOM name, so a hostile filename can never reach the path", async () => {
    const { url } = await upload(
      asFile(isoVideo("isom"), "../../../../etc/passwd.mp4", "video/mp4"),
      "gallery",
    );
    expect(url).not.toContain("passwd");
    expect(url).not.toContain("..");
  });

  it("rejects a fake MP4 — correct label and extension, wrong bytes", async () => {
    await expect(
      upload(asFile(Buffer.from("<html>not a video</html>"), "evil.mp4", "video/mp4"), "gallery"),
    ).rejects.toThrow(/Unsupported or corrupted video/i);
  });

  it("rejects video outside the gallery bucket", async () => {
    await expect(
      upload(asFile(isoVideo("isom"), "clip.mp4", "video/mp4"), "logos"),
    ).rejects.toThrow(/gallery/i);
  });

  it("rejects an empty file before it reaches any decoder", async () => {
    await expect(
      upload(asFile(Buffer.alloc(0), "empty.mp4", "video/mp4"), "gallery"),
    ).rejects.toThrow(/empty/i);
  });

  it("rejects an oversized video", async () => {
    const tooBig = Buffer.concat([isoVideo("isom"), Buffer.alloc(MAX_VIDEO_UPLOAD_BYTES + 1)]);
    await expect(
      upload(asFile(tooBig, "huge.mp4", "video/mp4"), "gallery"),
    ).rejects.toThrow(/50MB|too large/i);
  });

  it("rejects an unsupported declared type outright", async () => {
    await expect(
      upload(asFile(Buffer.from("GIF89a"), "x.gif", "image/gif"), "gallery"),
    ).rejects.toThrow(/Unsupported file type/i);
  });

  it("rejects an unknown bucket", async () => {
    await expect(
      upload(asFile(isoVideo("isom"), "clip.mp4", "video/mp4"), "../secrets"),
    ).rejects.toThrow(/bucket/i);
  });

  it("still accepts a real image and re-encodes it to WebP", async () => {
    const png = await sharp({ create: { width: 60, height: 40, channels: 3, background: "#123456" } })
      .png().toBuffer();
    const { url } = await upload(asFile(png, "photo.png", "image/png"), "logos");
    expect(url).toMatch(/\.webp$/);
    const stored = readFileSync(join(dir, "logos", url.split("/").pop()!));
    expect((await sharp(stored).metadata()).format).toBe("webp");
  });

  it("rejects an image whose bytes are not an image, whatever it claims", async () => {
    await expect(
      upload(asFile(Buffer.from("<svg onload=alert(1)>"), "x.png", "image/png"), "logos"),
    ).rejects.toThrow(/Could not process image/i);
  });
});