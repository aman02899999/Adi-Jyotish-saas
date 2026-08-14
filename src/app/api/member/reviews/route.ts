import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { getCurrentMember } from "@/lib/member-auth";
import { checkRateLimit, rateLimitResponse, requestIp } from "@/lib/rate-limit";
import { bookingFromDoc } from "@/app/api/bookings/route";
import { scanForContactInfo } from "@/lib/content-moderation";
import { getAdminIdsWithPermission } from "@/lib/admin-roles";
import { notifyAdmins } from "@/lib/notifications";

export async function POST(request:Request){
  const member=await getCurrentMember();
  if(!member)return Response.json({error:"Member sign-in required."},{status:401});
  const throttle = await checkRateLimit("practitioner-review", `member:${member.id}:ip:${requestIp(request)}`, 5, 600);
  if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);
  const body=await request.json() as {bookingId?:string;rating?:number;clarity?:number;empathy?:number;usefulness?:number;body?:string};
  const bookingId=body.bookingId?.trim();
  const scores=[body.rating,body.clarity,body.empathy,body.usefulness].map(Number);
  const text=body.body?.trim().slice(0,1200)??"";
  if(!bookingId||scores.some(score=>!Number.isInteger(score)||score<1||score>5)||text.length<20)return Response.json({error:"Choose all ratings and write at least 20 characters."},{status:400});

  const bookingSnap = await db.collection("bookings").doc(bookingId).get();
  if(!bookingSnap.exists) return Response.json({error:"Only completed practitioner consultations can be reviewed."},{status:403});
  const booking = bookingFromDoc(bookingSnap);
  if(booking.clientEmail!==member.email||booking.status!=="completed"||!booking.practitionerId){
    return Response.json({error:"Only completed practitioner consultations can be reviewed."},{status:403});
  }

  const doc = {
    practitionerId:booking.practitionerId,
    memberId:member.id,
    bookingId:booking.id,
    reviewerName:member.name,
    rating:scores[0],
    clarity:scores[1],
    empathy:scores[2],
    usefulness:scores[3],
    body:text,
    status:"published",
  };
  // Doc id = bookingId (one review per booking), so create() is an atomic fail-if-exists check —
  // a plain query-then-add here would let two concurrent submits for the same booking both pass
  // the "not yet reviewed" check and create duplicate reviews.
  const ref = db.collection("practitionerReviews").doc(bookingId);
  try {
    await ref.create({ ...doc, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  } catch {
    return Response.json({error:"This consultation has already been reviewed."},{status:409});
  }

  const contactFlag = scanForContactInfo(text);
  if (contactFlag) {
    getAdminIdsWithPermission("reviews").then(async (adminIds) => {
      if (!adminIds.length) return;
      await notifyAdmins(adminIds, {
        type: "review_contact_leak",
        title: `Review may contain ${contactFlag}`,
        body: `${member.name}'s review on a practitioner profile looks like it contains ${contactFlag} — worth a look before it stays visible.`,
        link: "/admin/reviews",
      });
    }).catch((error) => console.error("Review contact-leak flag failed", error));
  }

  return Response.json({ id: ref.id, ...doc, createdAt: new Date(), updatedAt: new Date() },{status:201});
}
