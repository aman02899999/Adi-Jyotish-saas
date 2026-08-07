import { db } from "@/lib/firestore";
import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";
import { generateSeedReviews, targetReviewCount } from "@/lib/review-seed-data";

export const dynamic = "force-dynamic";

const BATCH_SIZE = 450;

/** Tops up a practitioner's synthetic review count to a deterministic per-practitioner target
 * (see targetReviewCount), so re-running this for a practitioner that's already seeded is a
 * cheap no-op instead of piling up duplicates. One practitioner per call keeps each request well
 * under any serverless timeout even at the 1,000-review end of the "senior" range. */
export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "reviews")) return Response.json({ error: "Reviews permission required." }, { status: 403 });

  const body = (await request.json()) as { practitionerId?: string; practitionerName?: string; isSenior?: boolean };
  const { practitionerId, practitionerName } = body;
  if (!practitionerId || !practitionerName) return Response.json({ error: "practitionerId and practitionerName are required." }, { status: 400 });

  const target = targetReviewCount(practitionerId, Boolean(body.isSenior));
  const existingSnap = await db.collection("practitionerReviews").where("practitionerId", "==", practitionerId).select("source").get();
  const existingSeedCount = existingSnap.docs.filter((doc) => doc.data().source === "seed").length;
  const toAdd = Math.max(0, target - existingSeedCount);

  if (toAdd === 0) return Response.json({ added: 0, target, existingSeedCount });

  const reviews = generateSeedReviews(practitionerId, practitionerName, toAdd, existingSeedCount);
  const collectionRef = db.collection("practitionerReviews");
  for (let i = 0; i < reviews.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const review of reviews.slice(i, i + BATCH_SIZE)) {
      batch.set(collectionRef.doc(), {
        practitionerId,
        memberId: null,
        bookingId: review.bookingId,
        reviewerName: review.reviewerName,
        rating: review.rating,
        clarity: review.clarity,
        empathy: review.empathy,
        usefulness: review.usefulness,
        body: review.body,
        status: "published",
        source: "seed",
        createdAt: review.createdAt,
        updatedAt: review.createdAt,
      });
    }
    await batch.commit();
  }

  await recordAudit(admin, "reviews.seeded", "practitioner", practitionerId, { added: reviews.length, target });
  return Response.json({ added: reviews.length, target, existingSeedCount: existingSeedCount + reviews.length });
}
