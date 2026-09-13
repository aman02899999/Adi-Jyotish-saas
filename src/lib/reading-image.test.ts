import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { estimateGeminiTiles, FACE_MAX_EDGE, PALM_MAX_EDGE, prepareReadingImage } from "@/lib/reading-image";

/**
 * The point of this module is money, not pixels: Gemini bills vision input per 768x768 tile, so
 * these tests assert the drop in *billable tiles*, not merely that a file got smaller. Photos are
 * synthesised at real phone-camera dimensions so the numbers mean something.
 */

async function photo(width: number, height: number, format: "jpeg" | "png" = "jpeg") {
  const image = sharp({
    create: { width, height, channels: 3, background: { r: 180, g: 140, b: 90 } },
  });
  return format === "png" ? image.png().toBuffer() : image.jpeg().toBuffer();
}

async function dimensionsOf(base64: string) {
  const meta = await sharp(Buffer.from(base64, "base64")).metadata();
  return { width: meta.width ?? 0, height: meta.height ?? 0, format: meta.format };
}

describe("estimateGeminiTiles", () => {
  it("charges a single tile for a thumbnail", () => {
    expect(estimateGeminiTiles(384, 384)).toBe(1);
  });

  it("grows with area, which is what makes raw phone photos expensive", () => {
    expect(estimateGeminiTiles(1024, 1024)).toBe(4);
    // A 12MP phone photo — the default a member uploads without thinking about it.
    expect(estimateGeminiTiles(3024, 4032)).toBe(24);
  });
});

describe("prepareReadingImage", () => {
  it("cuts a 12MP phone photo down to the face budget", async () => {
    const before = { width: 3024, height: 4032 };
    const prepared = await prepareReadingImage(await photo(before.width, before.height), FACE_MAX_EDGE);
    const after = await dimensionsOf(prepared.base64);

    expect(Math.max(after.width, after.height)).toBe(FACE_MAX_EDGE);
    // The whole reason this module exists. A portrait 12MP photo fits into 768x1024, which is
    // two tiles — a 12x cut in billable vision input for one photo, and face readings take five.
    expect(estimateGeminiTiles(before.width, before.height)).toBe(24);
    expect(estimateGeminiTiles(after.width, after.height)).toBe(2);
  });

  it("leaves palms more detail than faces, deliberately", async () => {
    const source = await photo(3024, 4032);
    const [face, palm] = await Promise.all([
      prepareReadingImage(source, FACE_MAX_EDGE).then((p) => dimensionsOf(p.base64)),
      prepareReadingImage(source, PALM_MAX_EDGE).then((p) => dimensionsOf(p.base64)),
    ]);
    // Palm creases and small marks (islands, crosses) need the extra resolution; facial
    // proportion does not.
    expect(Math.max(palm.width, palm.height)).toBeGreaterThan(Math.max(face.width, face.height));
    expect(estimateGeminiTiles(palm.width, palm.height)).toBeLessThan(estimateGeminiTiles(3024, 4032));
  });

  it("preserves aspect ratio rather than squashing the subject", async () => {
    const prepared = await prepareReadingImage(await photo(3000, 1500), FACE_MAX_EDGE);
    const after = await dimensionsOf(prepared.base64);
    expect(after.width / after.height).toBeCloseTo(2, 1);
  });

  it("never enlarges an already-small photo into a bigger bill", async () => {
    const prepared = await prepareReadingImage(await photo(320, 240), FACE_MAX_EDGE);
    const after = await dimensionsOf(prepared.base64);
    expect(after.width).toBe(320);
    expect(after.height).toBe(240);
  });

  it("normalises PNG uploads to JPEG so the declared mime type always matches the bytes", async () => {
    const prepared = await prepareReadingImage(await photo(1200, 1200, "png"), FACE_MAX_EDGE);
    expect(prepared.mimeType).toBe("image/jpeg");
    expect((await dimensionsOf(prepared.base64)).format).toBe("jpeg");
  });

  it("rejects a file that is not a decodable image", async () => {
    // The routes catch this and answer 400 with a readable message rather than failing later,
    // after the member has already paid.
    await expect(prepareReadingImage(Buffer.from("this is not an image"), FACE_MAX_EDGE)).rejects.toThrow();
  });
});
