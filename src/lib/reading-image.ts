import "server-only";
import sharp from "sharp";

/**
 * Shrinks an uploaded photo before it is sent to Gemini.
 *
 * Gemini bills vision input by tiling an image into 768x768 crops and charging per tile, so cost
 * scales with pixel count, not file size. A photo straight off a modern phone is around 3000x4000
 * — roughly 24 tiles — while the same picture at 1024px on the long edge is about 4. Face readings
 * accept up to five photos, so an unshrunk submission could carry well over a hundred tiles into a
 * single request, dwarfing the few hundred text tokens the prompt itself costs.
 *
 * The previous code passed `file.arrayBuffer()` through untouched, which is what made image
 * readings one to two orders of magnitude more expensive than every text reading on the platform.
 *
 * Resolution is chosen per reading type rather than globally, because the two are not asking the
 * same thing of the image:
 *
 *   - Face reading judges proportion and shape — forehead height, jaw width, eye spacing. Those
 *     survive aggressive downscaling; 1024px is comfortably more than enough.
 *   - Palm reading has to resolve fine, low-contrast creases, and secondary marks (islands,
 *     crosses, stars) are small. It gets 1536px — still ~4x cheaper than a raw phone photo, but
 *     with enough detail left that the reading does not degrade.
 *
 * Images already smaller than the target are re-encoded but never enlarged (`withoutEnlargement`),
 * so a small upload is not padded into a bigger bill.
 */

export const FACE_MAX_EDGE = 1024;
export const PALM_MAX_EDGE = 1536;

/** JPEG at 82 is visually indistinguishable here and much smaller than the PNGs phones sometimes
 * produce. The format is normalised too: Gemini is told image/jpeg regardless of what came in,
 * so a HEIC or PNG upload cannot arrive with a mime type that disagrees with its bytes. */
const JPEG_QUALITY = 82;

export type PreparedImage = { base64: string; mimeType: string };

export async function prepareReadingImage(input: Buffer, maxEdge: number): Promise<PreparedImage> {
  const output = await sharp(input)
    // Phone photos carry orientation in EXIF; without this a portrait shot reaches the model
    // rotated, and a palmist reading a sideways hand is being set up to fail.
    .rotate()
    .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();

  return { base64: output.toString("base64"), mimeType: "image/jpeg" };
}

/** Rough count of the 768x768 tiles Gemini would bill for an image of these dimensions. Used by
 * the tests to prove the resize actually reduces billable tiles rather than just file bytes. */
export function estimateGeminiTiles(width: number, height: number) {
  if (width <= 384 && height <= 384) return 1;
  return Math.ceil(width / 768) * Math.ceil(height / 768);
}
