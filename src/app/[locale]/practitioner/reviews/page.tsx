import { Star } from "lucide-react";
import { PractitionerShell } from "@/components/practitioner-shell";
import { requirePractitionerPage } from "@/lib/practitioner-auth";
import { getPractitionerReviews } from "@/lib/practitioner-portal";

export const dynamic = "force-dynamic";

export default async function PractitionerReviewsPage() {
  const practitioner = await requirePractitionerPage();
  const reviews = await getPractitionerReviews(practitioner.id);

  return (
    <PractitionerShell practitioner={practitioner} active="Reviews">
      <div className="consultation-heading billing-heading"><div><p>Your workspace</p><h1>Reviews</h1><span>What clients are saying about your sessions.</span></div></div>
      <div className="review-list">
        {reviews.map((review) => (
          <article className="review-item" key={review.id}>
            <div className="review-item__head">
              <strong>{review.reviewerName}</strong>
              <span className="review-item__stars">{Array.from({ length: 5 }, (_, index) => <Star key={index} size={12} fill={index < review.rating ? "currentColor" : "none"} />)}</span>
            </div>
            <p>{review.body}</p>
            <small>{new Date(review.createdAt).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}</small>
          </article>
        ))}
        {!reviews.length && <div className="consultation-empty"><Star size={26} /><h3>No reviews yet</h3><p>Client feedback will appear here after published reviews.</p></div>}
      </div>
    </PractitionerShell>
  );
}
