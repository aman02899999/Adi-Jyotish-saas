/**
 * Generates realistic-looking (but synthetic) practitioner reviews for admin-triggered seeding.
 * Pure data + composition logic — no Firestore access here, see the /api/admin/reviews/seed route.
 */

type Region = { place: string; cities: string[]; firstNames: string[]; lastNames: string[] };

const INDIA_REGIONS: Region[] = [
  { place: "Punjab", cities: ["Amritsar", "Ludhiana", "Jalandhar"], firstNames: ["Gurpreet", "Simran", "Harpreet", "Manpreet", "Jaspreet", "Rajwinder", "Navjot", "Amandeep"], lastNames: ["Singh", "Kaur", "Sidhu", "Gill", "Brar", "Chahal"] },
  { place: "Delhi", cities: ["New Delhi", "Dwarka", "Rohini"], firstNames: ["Rohit", "Priya", "Ankit", "Neha", "Saurabh", "Pooja", "Varun", "Ritika"], lastNames: ["Sharma", "Malhotra", "Gupta", "Verma", "Khanna", "Arora", "Chawla"] },
  { place: "Maharashtra", cities: ["Mumbai", "Pune", "Nagpur", "Nashik"], firstNames: ["Aditya", "Sneha", "Rahul", "Pooja", "Nikhil", "Swati", "Omkar", "Snehal"], lastNames: ["Patil", "Kulkarni", "Deshmukh", "Joshi", "Rane", "More", "Sawant"] },
  { place: "Karnataka", cities: ["Bengaluru", "Mysuru", "Mangaluru"], firstNames: ["Karthik", "Divya", "Manjunath", "Lakshmi", "Suresh", "Sushma", "Nagesh", "Deepa"], lastNames: ["Gowda", "Shetty", "Rao", "Hegde", "Naik", "Bhat"] },
  { place: "Tamil Nadu", cities: ["Chennai", "Coimbatore", "Madurai"], firstNames: ["Karthikeyan", "Priya", "Arun", "Lakshmi", "Deepa", "Senthil", "Kavya", "Vignesh"], lastNames: ["Raman", "Kumar", "Narayanan", "Rajan", "Subramaniam", "Iyer"] },
  { place: "Telangana", cities: ["Hyderabad", "Warangal"], firstNames: ["Srinivas", "Anitha", "Praveen", "Swetha", "Kiran", "Bhargavi"], lastNames: ["Reddy", "Rao", "Goud", "Naidu"] },
  { place: "West Bengal", cities: ["Kolkata", "Howrah", "Siliguri"], firstNames: ["Debashish", "Ananya", "Souvik", "Priyanka", "Arindam", "Ritwika"], lastNames: ["Banerjee", "Chatterjee", "Das", "Mukherjee", "Ghosh", "Sarkar"] },
  { place: "Gujarat", cities: ["Ahmedabad", "Surat", "Vadodara"], firstNames: ["Kunal", "Riya", "Jayesh", "Foram", "Mehul", "Bhavna"], lastNames: ["Patel", "Shah", "Mehta", "Trivedi", "Desai"] },
  { place: "Rajasthan", cities: ["Jaipur", "Jodhpur", "Udaipur"], firstNames: ["Vikram", "Kavita", "Devendra", "Manisha", "Yogendra", "Poonam"], lastNames: ["Rathore", "Sharma", "Singh", "Chouhan", "Agarwal"] },
  { place: "Uttar Pradesh", cities: ["Lucknow", "Kanpur", "Varanasi", "Noida"], firstNames: ["Ravi", "Anjali", "Sanjay", "Neelam", "Abhishek", "Shweta"], lastNames: ["Tripathi", "Mishra", "Yadav", "Singh", "Srivastava"] },
  { place: "Bihar", cities: ["Patna", "Gaya"], firstNames: ["Amit", "Rekha", "Ashok", "Sunita", "Vivek", "Priyanka"], lastNames: ["Kumar", "Devi", "Jha", "Singh"] },
  { place: "Madhya Pradesh", cities: ["Bhopal", "Indore", "Gwalior"], firstNames: ["Rajesh", "Shalini", "Deepak", "Kiran", "Ajay", "Mamta"], lastNames: ["Chouhan", "Verma", "Sharma", "Malviya"] },
  { place: "Kerala", cities: ["Kochi", "Thiruvananthapuram", "Kozhikode"], firstNames: ["Arjun", "Meera", "Vishnu", "Anju", "Sooraj", "Anjali"], lastNames: ["Nair", "Menon", "Pillai", "Krishnan", "Varma"] },
  { place: "Odisha", cities: ["Bhubaneswar", "Cuttack"], firstNames: ["Bibhuti", "Snigdha", "Rajesh", "Swagatika"], lastNames: ["Mohanty", "Patra", "Das", "Nayak"] },
  { place: "Assam", cities: ["Guwahati"], firstNames: ["Bhaskar", "Rituporna", "Dipankar", "Mousumi"], lastNames: ["Bora", "Saikia", "Das", "Gogoi"] },
  { place: "Haryana", cities: ["Gurugram", "Faridabad"], firstNames: ["Vikas", "Neetu", "Sandeep", "Rekha"], lastNames: ["Yadav", "Sharma", "Chaudhary", "Malik"] },
  { place: "Jharkhand", cities: ["Ranchi", "Jamshedpur"], firstNames: ["Suman", "Anita", "Rakesh", "Poonam"], lastNames: ["Kumar", "Oraon", "Prasad"] },
  { place: "Andhra Pradesh", cities: ["Vijayawada", "Visakhapatnam"], firstNames: ["Ramesh", "Lakshmi", "Suresh", "Padma"], lastNames: ["Naidu", "Reddy", "Rao"] },
  { place: "Chandigarh", cities: ["Chandigarh"], firstNames: ["Ekam", "Ishleen", "Raghav", "Anmol"], lastNames: ["Bedi", "Kohli", "Sethi"] },
  { place: "Uttarakhand", cities: ["Dehradun", "Haridwar"], firstNames: ["Deepak", "Meenakshi", "Rajendra", "Kavita"], lastNames: ["Rawat", "Bisht", "Negi"] },
];

const INTL_REGIONS: Region[] = [
  { place: "United States", cities: ["New York", "San Francisco", "Chicago", "New Jersey"], firstNames: ["Rajesh", "Priya", "Michael", "Sarah", "Arvind", "Deepika"], lastNames: ["Iyer", "Nair", "Fernandes", "Thompson", "Menon", "Reddy"] },
  { place: "United Kingdom", cities: ["London", "Birmingham", "Manchester"], firstNames: ["Amit", "Kavya", "James", "Emma", "Sunil", "Rina"], lastNames: ["Desai", "Shah", "Wilson", "Clarke", "Patel"] },
  { place: "Canada", cities: ["Toronto", "Vancouver", "Brampton"], firstNames: ["Harpreet", "Neha", "David", "Simran", "Manjit"], lastNames: ["Brar", "Kapoor", "Miller", "Dhillon"] },
  { place: "Australia", cities: ["Sydney", "Melbourne", "Perth"], firstNames: ["Rohan", "Emily", "Aakash", "Chloe", "Vikram"], lastNames: ["Mehta", "Clarke", "Bhandari", "Nguyen"] },
  { place: "UAE", cities: ["Dubai", "Abu Dhabi", "Sharjah"], firstNames: ["Anand", "Zara", "Faisal", "Meera", "Imran"], lastNames: ["Pillai", "Khan", "Ahmed", "Suresh"] },
  { place: "Singapore", cities: ["Singapore"], firstNames: ["Arvind", "Wei Lin", "Karthik", "Su Ming"], lastNames: ["Menon", "Tan", "Raman", "Lee"] },
  { place: "Nepal", cities: ["Kathmandu", "Pokhara"], firstNames: ["Bibek", "Sunita", "Prakash", "Anita"], lastNames: ["Shrestha", "Gurung", "Thapa", "Rai"] },
  { place: "Malaysia", cities: ["Kuala Lumpur", "Penang"], firstNames: ["Raj", "Kavitha", "Suresh", "Priya"], lastNames: ["Kumar", "Subramaniam", "Nair"] },
];

const TOPICS = [
  "career", "marriage", "love life", "health", "finances", "family issues", "job change", "business decisions",
  "my child's education", "property matters", "relationship problems", "career growth", "marriage timing",
  "Manglik dosha", "Kundli matching", "the gemstone I should wear", "my father's health", "a court case",
  "business partnership", "study abroad plans",
];

const OPENERS_POSITIVE_EN = [
  "Had a session with {ref} about {topic} and it was really insightful.",
  "Booked a reading with {ref} last month, honestly very accurate predictions.",
  "{ref} explained my chart in such simple language, loved it.",
  "Consulted {ref} for guidance on {topic} and got so much clarity.",
  "Very genuine and patient, {ref} listened to all my questions about {topic}.",
  "I was skeptical at first but {ref} really surprised me with the accuracy.",
  "My sister recommended {ref} and now I understand why.",
  "Second time booking with {ref}, still as detailed as the first session.",
];

const OPENERS_POSITIVE_HI = [
  "{ref} se {topic} ke baare mein baat ki, bahut accha laga.",
  "Maine {ref} se consultation liya tha, predictions bilkul sahi nikle.",
  "{ref} ne meri kundli dekhkar {topic} ke baare mein bahut clear guidance di.",
  "Sach mein bahut satisfied hoon, {ref} ne har sawaal ka jawab diya.",
  "Pehli baar online astrologer se baat ki aur {ref} ne bilkul sahi disha dikhayi.",
  "Bahut dinon se pareshaan thi {topic} ko lekar, {ref} ne sab clear kar diya.",
  "Friend ne suggest kiya tha, ab pata chala kyu itni demand hai {ref} ki.",
];

const MIDDLES_POSITIVE_EN = [
  "The remedies suggested were practical and easy to follow.",
  "Explained the planetary positions clearly without rushing through it.",
  "Answered every follow-up question patiently.",
  "Gave a realistic timeline instead of vague promises.",
  "The call connected right on time, no delays at all.",
  "Felt heard, not just given generic answers.",
  "Even pointed out things about my chart I hadn't mentioned.",
  "Broke down the dasha periods in a way I could actually understand.",
];

const MIDDLES_POSITIVE_HI = [
  "Remedies bhi bahut simple the, ghar par easily kar sakte hain.",
  "Bilkul time pe call connect hua, koi delay nahi.",
  "Har sawaal ka detail mein jawab mila, bahut patience se suna.",
  "Kundli ke har point ko itni acchi tarah samjhaya ki sab clear ho gaya.",
  "Bina bataye hi meri kaafi baatein sahi bata di, sach mein hairan reh gayi.",
  "Dasha aur gochar dono explain kiya, ab samajh aa gaya timing ka.",
];

const CLOSERS_POSITIVE_EN = [
  "Highly recommend booking a session if you're confused about your path.",
  "Will definitely book again for a follow-up.",
  "Worth every rupee, thank you Jyotish Studio.",
  "Five stars, exactly what I needed to hear.",
  "Already told my family to book a session too.",
  "Thank you so much, feeling much more at peace now.",
];

const CLOSERS_POSITIVE_HI = [
  "Bahut recommend karungi sabko.",
  "Paisa vasool session tha, bahut dhanyawad.",
  "Dobara zaroor book karunga is guidance ke liye.",
  "Bas itna kahungi, agar confuse ho toh ek baar zaroor try karein.",
  "Ghar walon ko bhi bata diya hai, sab book karenge ab.",
];

const SHORT_POSITIVE = [
  "Very accurate and helpful, thank you!",
  "Bahut acche the, thanks!",
  "Clear guidance, exactly what I needed.",
  "Sahi mein bahut helpful session tha.",
  "Loved the session, very calming and precise.",
  "Highly recommended, very genuine reading.",
  "Bohot accha experience raha, thank you so much.",
  "Great session, answered all my doubts quickly.",
];

const NEUTRAL_EN = [
  "Decent session, some predictions matched, some are still to be seen.",
  "Overall okay experience, would have liked a bit more detail on {topic}.",
  "Session was fine, felt slightly rushed near the end though.",
  "Good insights on {topic}, but I expected a longer call for the price.",
  "It was helpful, though a couple of points felt a little generic.",
];

const NEUTRAL_HI = [
  "Session theek tha, {topic} pe thoda aur detail expect kar rahi thi.",
  "Kuch baatein sahi lagi, kuch abhi wait karna padega dekhne ke liye.",
  "Thoda hurried laga end mein, baaki sab sahi tha.",
  "Overall accha tha lekin thoda aur time milta toh better hota.",
];

const CRITICAL_EN = [
  "Session was okay but felt a bit rushed, expected more depth on {topic}.",
  "Call quality was fine but answers felt a little too general for my questions.",
  "Not bad, but I was hoping for more specific guidance on {topic}.",
];

const CRITICAL_HI = [
  "Thoda rushed laga session, {topic} pe aur detail chahiye tha.",
  "Theek tha overall, lekin specific answers thoda kam mile.",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let state = seed;
  return function random() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic per-practitioner target so repeated seed calls are idempotent ("top up to target"). */
export function targetReviewCount(practitionerId: string, isSenior: boolean): number {
  const random = mulberry32(hashString(practitionerId));
  const [min, max] = isSenior ? [400, 1000] : [30, 40];
  return min + Math.floor(random() * (max - min + 1));
}

function practitionerRef(practitionerName: string): string {
  const cleaned = practitionerName.replace(/^(Shree|Pandit|Dr\.?)\s+/i, "").trim();
  const first = cleaned.split(" ")[0];
  return pick([first, "guruji", "ji", `${first} ji`, "the astrologer"]);
}

function rollRating(): number {
  const r = Math.random();
  if (r < 0.5) return 5;
  if (r < 0.85) return 4;
  if (r < 0.95) return 3;
  if (r < 0.99) return 2;
  return 1;
}

function jitterDimension(rating: number): number {
  const delta = Math.floor(Math.random() * 3) - 1;
  return Math.min(5, Math.max(1, rating + delta));
}

function fill(template: string, ref: string, topic: string): string {
  return template.replaceAll("{ref}", ref).replaceAll("{topic}", topic);
}

function composeBody(rating: number, practitionerName: string): string {
  const ref = practitionerRef(practitionerName);
  const topic = pick(TOPICS);
  const style = Math.random();

  if (rating >= 4) {
    if (style < 0.18) return pick(SHORT_POSITIVE);
    if (style < 0.55) {
      return [fill(pick(OPENERS_POSITIVE_EN), ref, topic), fill(pick(MIDDLES_POSITIVE_EN), ref, topic), pick(CLOSERS_POSITIVE_EN)].join(" ");
    }
    if (style < 0.8) {
      return [fill(pick(OPENERS_POSITIVE_HI), ref, topic), fill(pick(MIDDLES_POSITIVE_HI), ref, topic), pick(CLOSERS_POSITIVE_HI)].join(" ");
    }
    return [fill(pick(OPENERS_POSITIVE_EN), ref, topic), fill(pick(MIDDLES_POSITIVE_HI), ref, topic), pick(CLOSERS_POSITIVE_HI)].join(" ");
  }

  if (rating === 3) {
    return style < 0.5 ? fill(pick(NEUTRAL_EN), ref, topic) : fill(pick(NEUTRAL_HI), ref, topic);
  }

  return style < 0.5 ? fill(pick(CRITICAL_EN), ref, topic) : fill(pick(CRITICAL_HI), ref, topic);
}

function pickReviewerName(): { name: string; place: string } {
  const isIntl = Math.random() < 0.075; // 5-10% band, ~7.5% expected
  const region = pick(isIntl ? INTL_REGIONS : INDIA_REGIONS);
  const first = pick(region.firstNames);
  const last = pick(region.lastNames);
  const abbreviated = Math.random() < 0.3;
  const name = abbreviated ? `${first} ${last.charAt(0)}.` : `${first} ${last}`;
  return { name, place: `${pick(region.cities)}, ${region.place}` };
}

function randomPastDate(daysBack: number): Date {
  const now = Date.now();
  const offsetMs = Math.floor(Math.random() * daysBack) * 24 * 60 * 60 * 1000;
  return new Date(now - offsetMs);
}

export type SeedReview = {
  reviewerName: string;
  rating: number;
  clarity: number;
  empathy: number;
  usefulness: number;
  body: string;
  createdAt: Date;
  bookingId: string;
};

export function generateSeedReviews(practitionerId: string, practitionerName: string, count: number, startIndex: number): SeedReview[] {
  const reviews: SeedReview[] = [];
  for (let i = 0; i < count; i++) {
    const rating = rollRating();
    const { name } = pickReviewerName();
    reviews.push({
      reviewerName: name,
      rating,
      clarity: jitterDimension(rating),
      empathy: jitterDimension(rating),
      usefulness: jitterDimension(rating),
      body: composeBody(rating, practitionerName),
      createdAt: randomPastDate(720),
      bookingId: `seed-${practitionerId}-${startIndex + i}-${Math.random().toString(36).slice(2, 8)}`,
    });
  }
  return reviews;
}
