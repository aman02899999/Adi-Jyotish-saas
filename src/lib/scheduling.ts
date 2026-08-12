import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { db, isIndexBuildingError } from "@/lib/firestore";
import { getStudioSettings } from "@/lib/studio-settings";

export type Practitioner = {
  id: string; // Firestore doc ID == slug
  name: string;
  slug: string;
  email: string;
  title: string;
  bio: string;
  specialties: string;
  languages: string;
  consultationModes: string;
  experienceYears: number;
  verified: boolean;
  verificationLevel: string;
  photoUrl: string | null;
  online: boolean;
  chatRatePerMinute: number;
  active: boolean;
  featured: boolean;
  firebaseUid: string | null;
  hasPortalAccess: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AvailabilityRule = { id: string; practitionerId: string; weekday: number; startTime: string; endTime: string; active: boolean };
export type PractitionerTimeOff = { id: string; practitionerId: string; startsAt: Date; endsAt: Date; reason: string | null };

const starterPractitioners: Array<Omit<Practitioner, "id" | "firebaseUid" | "hasPortalAccess" | "lastLoginAt" | "createdAt" | "updatedAt" | "online">> = [
  {
    name: "Shree Jagmohan Shashtri Ji",
    slug: "jagmohan-shashtri-ji",
    email: "jagmohan.shashtri@jyotish.studio",
    title: "Senior Vedic Astrologer",
    bio: "With over 44 years of dedicated experience in Vedic Astrology, Shree Jagmohan Shashtri Ji has devoted his life to studying ancient Vedic scriptures and guiding individuals through life's most important decisions. His consultations draw on birth chart analysis, planetary periods, and classical yogas to offer practical guidance and remedies tailored to each person's circumstances. Over four decades he has earned the trust of clients across India and abroad through his deep knowledge, ethical practice, and compassionate approach.",
    specialties: "Vedic Astrology (Jyotish), Kundli Analysis, Horoscope Reading, Career & Business Guidance, Marriage & Relationship Consultation, Kundli Milan, Mangal Dosha, Kaal Sarp Dosha, Shani Sade Sati, Gemstone Recommendations, Vastu Consultation, Numerology",
    languages: "Hindi, Sanskrit",
    consultationModes: "Chat, Audio, Video",
    experienceYears: 44,
    verified: true,
    verificationLevel: "senior-panel",
    photoUrl: "/images/practitioners/jagmohan-shashtri.jpg",
    chatRatePerMinute: 121,
    active: true,
    featured: true,
  },
  {
    name: "Shree Arun Dubey Ji",
    slug: "arun-dubey-ji",
    email: "arun.dubey@jyotish.studio",
    title: "Certified Gemstone & Vedic Astrology Expert",
    bio: "With over 38 years of experience in Vedic Astrology and Gemstone Consultation, Shree Arun Dubey Ji is renowned for helping individuals select authentic gemstones based on detailed astrological analysis. His expertise combines the timeless principles of Vedic astrology with a deep understanding of planetary energies, ensuring every recommendation is tailored to the individual's birth chart and life circumstances. Throughout his distinguished career, he has guided thousands of clients in choosing natural, certified gemstones to complement their spiritual and astrological journey.",
    specialties: "Vedic Gemstone Consultation, Birth Chart (Kundli) Analysis, Planetary Strength Analysis, Certified Natural Gemstone Selection, Navratna Consultation, Rudraksha Recommendation, Career & Business Guidance, Marriage & Relationship Consultation, Shani, Rahu & Ketu Remedies, Gemstone Energization Guidance, Wealth & Prosperity Consultation",
    languages: "Hindi, Sanskrit",
    consultationModes: "Chat, Audio, Video",
    experienceYears: 38,
    verified: true,
    verificationLevel: "senior-panel",
    photoUrl: "/images/practitioners/arun-dubey.jpg",
    chatRatePerMinute: 109,
    active: true,
    featured: true,
  },
  {
    name: "Anika Sharma",
    slug: "anika-sharma",
    email: "anika@jyotish.studio",
    title: "Senior Vedic Astrologer",
    bio: "Anika brings classical Parashari technique into grounded conversations about purpose, timing, and visible growth.",
    specialties: "Birth charts, Career & dharma, Planetary periods",
    languages: "English, Hindi, Sanskrit",
    consultationModes: "Video, Audio, Chat",
    experienceYears: 14,
    verified: true,
    verificationLevel: "senior-panel",
    photoUrl: "/images/practitioners/anika-sharma.jpg",
    chatRatePerMinute: 19,
    active: true,
    featured: true,
  },
  {
    name: "Rohan Mehta",
    slug: "rohan-mehta",
    email: "rohan@jyotish.studio",
    title: "Jyotish Relationship Guide",
    bio: "Rohan specializes in compassionate chart synthesis, partnership patterns, and choosing auspicious moments for change.",
    specialties: "Relationships, Muhurat, Panchang",
    languages: "English, Hindi, Gujarati",
    consultationModes: "Video, Audio, Chat",
    experienceYears: 10,
    verified: true,
    verificationLevel: "verified-panel",
    photoUrl: "/images/practitioners/rohan-mehta.jpg",
    chatRatePerMinute: 15,
    active: true,
    featured: false,
  },

  // Five practitioners per homepage category (see the `query` values in the homepage's
  // `categories` array and CATEGORY_COPY in astrologers/page.tsx) so every category tile leads
  // to a marketplace that's actually populated with relevant guides, not an empty/generic list.
  // Each one's `specialties` deliberately contains the literal category keyword the free-text
  // search in MarketplaceExplorer matches against.

  // Love & Relationships
  {
    name: "Meera Kulkarni",
    slug: "meera-kulkarni",
    email: "meera.kulkarni@jyotish.studio",
    title: "Relationship & Compatibility Astrologer",
    bio: "Meera reads Venus and the 7th house to help people understand connection patterns, timing, and what a relationship actually needs to last — not just whether two charts are 'compatible' on paper.",
    specialties: "Relationships, Love Compatibility, Nakshatra Matching, Venus Analysis",
    languages: "English, Hindi, Marathi",
    consultationModes: "Video, Audio, Chat",
    experienceYears: 11,
    verified: true,
    verificationLevel: "verified-panel",
    photoUrl: "/images/practitioners/meera-kulkarni.jpg",
    chatRatePerMinute: 18,
    active: true,
    featured: false,
  },
  {
    name: "Ravindra Bhatt",
    slug: "ravindra-bhatt",
    email: "ravindra.bhatt@jyotish.studio",
    title: "Prem aur Rishtey Visheshagya",
    bio: "Ravindra ji has spent over a decade helping clients navigate love, courtship, and long-distance relationships through classical Jyotish, with a practical focus on timing and honest communication.",
    specialties: "Relationships, Prem Vivah, Love Astrology, Timing Guidance",
    languages: "Hindi, Gujarati",
    consultationModes: "Audio, Chat",
    experienceYears: 16,
    verified: true,
    verificationLevel: "verified-panel",
    photoUrl: "/images/practitioners/ravindra-bhatt.jpg",
    chatRatePerMinute: 20,
    active: true,
    featured: false,
  },
  {
    name: "Ananya Iyer",
    slug: "ananya-iyer",
    email: "ananya.iyer@jyotish.studio",
    title: "Love & Relationship Guide",
    bio: "Ananya combines emotional-compatibility reading with classical dasha timing, focused on helping clients recognize patterns that repeat across relationships and what to do differently.",
    specialties: "Relationships, Emotional Compatibility, Dasha Timing",
    languages: "English, Tamil, Hindi",
    consultationModes: "Video, Chat",
    experienceYears: 9,
    verified: true,
    verificationLevel: "verified-panel",
    photoUrl: "/images/practitioners/ananya-iyer.jpg",
    chatRatePerMinute: 16,
    active: true,
    featured: false,
  },
  {
    name: "Suresh Nair",
    slug: "suresh-nair",
    email: "suresh.nair@jyotish.studio",
    title: "Relationship Astrology Specialist",
    bio: "Suresh works with couples and individuals navigating breakups, reconciliation, and second relationships, drawing on kundli comparison and grounded, judgment-free conversation.",
    specialties: "Relationships, Kundli Compatibility, Breakup Guidance",
    languages: "English, Malayalam, Hindi",
    consultationModes: "Video, Audio, Chat",
    experienceYears: 13,
    verified: true,
    verificationLevel: "verified-panel",
    photoUrl: "/images/practitioners/suresh-nair.jpg",
    chatRatePerMinute: 19,
    active: true,
    featured: false,
  },
  {
    name: "Priyanka Deshmukh",
    slug: "priyanka-deshmukh",
    email: "priyanka.deshmukh@jyotish.studio",
    title: "Relationship Counseling Astrologer",
    bio: "Priyanka specializes in long-distance and cross-cultural relationships, helping clients read timing around reunions, proposals, and big commitments with clear, practical guidance.",
    specialties: "Relationships, Long-Distance Compatibility, Love Timing",
    languages: "English, Hindi, Marathi",
    consultationModes: "Video, Chat",
    experienceYears: 8,
    verified: true,
    verificationLevel: "verified-panel",
    photoUrl: "/images/practitioners/priyanka-deshmukh.jpg",
    chatRatePerMinute: 14,
    active: true,
    featured: false,
  },

  // Marriage
  {
    name: "Harish Shukla",
    slug: "harish-shukla",
    email: "harish.shukla@jyotish.studio",
    title: "Vivah Jyotish Visheshagya",
    bio: "Harish ji has guided hundreds of families through kundli milan and vivah muhurat selection, blending classical Ashtakoot matching with honest conversation about real compatibility.",
    specialties: "Marriage, Kundli Milan, Vivah Muhurat, Ashtakoot Matching",
    languages: "Hindi, Sanskrit",
    consultationModes: "Audio, Video, Chat",
    experienceYears: 19,
    verified: true,
    verificationLevel: "verified-panel",
    photoUrl: "/images/practitioners/harish-shukla.jpg",
    chatRatePerMinute: 24,
    active: true,
    featured: false,
  },
  {
    name: "Radhika Menon",
    slug: "radhika-menon",
    email: "radhika.menon@jyotish.studio",
    title: "Marriage Compatibility Astrologer",
    bio: "Radhika focuses on pre-marriage compatibility analysis and Manglik dosha assessment, helping families approach marriage decisions with clarity instead of anxiety.",
    specialties: "Marriage, Ashtakoot Matching, Manglik Dosha, Compatibility Analysis",
    languages: "English, Malayalam, Hindi",
    consultationModes: "Video, Audio, Chat",
    experienceYears: 12,
    verified: true,
    verificationLevel: "verified-panel",
    photoUrl: "/images/practitioners/radhika-menon.jpg",
    chatRatePerMinute: 18,
    active: true,
    featured: false,
  },
  {
    name: "Om Prakash Tiwari",
    slug: "om-prakash-tiwari",
    email: "omprakash.tiwari@jyotish.studio",
    title: "Marriage & Muhurat Expert",
    bio: "With over two decades of experience, Om Prakash ji is known for precise vivah muhurat selection and practical remedies for dosha concerns raised before marriage.",
    specialties: "Marriage, Vivah Muhurat, Dosha Remedies, Panchang",
    languages: "Hindi, Bhojpuri",
    consultationModes: "Audio, Chat",
    experienceYears: 21,
    verified: true,
    verificationLevel: "senior-panel",
    photoUrl: "/images/practitioners/om-prakash-tiwari.jpg",
    chatRatePerMinute: 26,
    active: true,
    featured: false,
  },
  {
    name: "Kavita Joshi",
    slug: "kavita-joshi",
    email: "kavita.joshi@jyotish.studio",
    title: "Vedic Marriage Counselor",
    bio: "Kavita works with couples both before and after marriage, using chart synthesis to address recurring friction points and support long-term harmony.",
    specialties: "Marriage, Compatibility Analysis, Post-Marriage Harmony",
    languages: "English, Hindi, Marathi",
    consultationModes: "Video, Chat",
    experienceYears: 10,
    verified: true,
    verificationLevel: "verified-panel",
    photoUrl: null,
    chatRatePerMinute: 17,
    active: true,
    featured: false,
  },
  {
    name: "Deepak Pandey",
    slug: "deepak-pandey",
    email: "deepak.pandey@jyotish.studio",
    title: "Kundli Milan Specialist",
    bio: "Deepak ji specializes in Guna Milan and detailed kundli comparison, giving families a clear, honest read on compatibility scores and what they actually mean.",
    specialties: "Marriage, Kundli Milan, Guna Milan",
    languages: "Hindi, Sanskrit",
    consultationModes: "Audio, Video, Chat",
    experienceYears: 15,
    verified: true,
    verificationLevel: "verified-panel",
    photoUrl: "/images/practitioners/deepak-pandey.jpg",
    chatRatePerMinute: 20,
    active: true,
    featured: false,
  },

  // Career & Business
  {
    name: "Rajesh Malhotra",
    slug: "rajesh-malhotra",
    email: "rajesh.malhotra@jyotish.studio",
    title: "Career & Business Astrologer",
    bio: "Rajesh reads the 10th house and current dasha to help professionals time job changes, promotions, and business launches with more confidence.",
    specialties: "Career, Business Growth, Job Change Timing",
    languages: "English, Hindi, Punjabi",
    consultationModes: "Video, Audio, Chat",
    experienceYears: 17,
    verified: true,
    verificationLevel: "verified-panel",
    photoUrl: null,
    chatRatePerMinute: 22,
    active: true,
    featured: false,
  },
  {
    name: "Sneha Kapadia",
    slug: "sneha-kapadia",
    email: "sneha.kapadia@jyotish.studio",
    title: "Career Path Specialist",
    bio: "Sneha helps clients navigate mid-career transitions and second careers, combining planetary period analysis with practical, real-world advice.",
    specialties: "Career, Career Transitions, Professional Timing",
    languages: "English, Hindi, Gujarati",
    consultationModes: "Video, Chat",
    experienceYears: 9,
    verified: true,
    verificationLevel: "verified-panel",
    photoUrl: "/images/practitioners/sneha-kapadia.jpg",
    chatRatePerMinute: 16,
    active: true,
    featured: false,
  },
  {
    name: "Suresh Agarwal",
    slug: "suresh-agarwal",
    email: "suresh.agarwal@jyotish.studio",
    title: "Business Growth Jyotishi",
    bio: "Suresh ji specializes in business partnership charts and financial astrology, widely consulted before major investments and partnership decisions.",
    specialties: "Career, Business Partnerships, Financial Astrology",
    languages: "Hindi, Marwari",
    consultationModes: "Audio, Video, Chat",
    experienceYears: 14,
    verified: true,
    verificationLevel: "verified-panel",
    photoUrl: null,
    chatRatePerMinute: 21,
    active: true,
    featured: false,
  },
  {
    name: "Ashok Bhargava",
    slug: "ashok-bhargava",
    email: "ashok.bhargava@jyotish.studio",
    title: "Corporate Astrology Consultant",
    bio: "Ashok works with founders and corporate professionals on startup timing and organizational growth cycles, grounded in classical dasha analysis.",
    specialties: "Career, Corporate Growth, Startup Timing",
    languages: "English, Hindi",
    consultationModes: "Video, Chat",
    experienceYears: 12,
    verified: true,
    verificationLevel: "verified-panel",
    photoUrl: null,
    chatRatePerMinute: 19,
    active: true,
    featured: false,
  },
  {
    name: "Priya Ramachandran",
    slug: "priya-ramachandran",
    email: "priya.ramachandran@jyotish.studio",
    title: "Career Timing Expert",
    bio: "Priya focuses on promotion timing and job-switch guidance, helping clients recognize favorable windows instead of acting purely on impulse or pressure.",
    specialties: "Career, Promotion Timing, Job Switch Guidance",
    languages: "English, Tamil, Telugu",
    consultationModes: "Video, Audio, Chat",
    experienceYears: 8,
    verified: true,
    verificationLevel: "verified-panel",
    photoUrl: null,
    chatRatePerMinute: 15,
    active: true,
    featured: false,
  },

  // Health & Wellness
  {
    name: "Mahesh Chandra Awasthi",
    slug: "mahesh-awasthi",
    email: "mahesh.awasthi@jyotish.studio",
    title: "Health & Wellness Jyotishi",
    bio: "Mahesh ji reads planetary influence on vitality and recovery cycles, working alongside — never in place of — medical care, to support clients through prolonged health concerns.",
    specialties: "Health, Ayurvedic Astrology, Vitality Analysis",
    languages: "Hindi, Sanskrit",
    consultationModes: "Audio, Chat",
    experienceYears: 18,
    verified: true,
    verificationLevel: "verified-panel",
    photoUrl: null,
    chatRatePerMinute: 23,
    active: true,
    featured: false,
  },
  {
    name: "Sunita Rao",
    slug: "sunita-rao",
    email: "sunita.rao@jyotish.studio",
    title: "Ayurvedic Astrology Specialist",
    bio: "Sunita blends Ayurveda-aligned astrology with wellness timing, helping clients understand cycles of energy and rest through the chart.",
    specialties: "Health, Ayurveda Alignment, Wellness Timing",
    languages: "English, Kannada, Hindi",
    consultationModes: "Video, Chat",
    experienceYears: 11,
    verified: true,
    verificationLevel: "verified-panel",
    photoUrl: "/images/practitioners/sunita-rao.jpg",
    chatRatePerMinute: 17,
    active: true,
    featured: false,
  },
  {
    name: "Anil Bhatnagar",
    slug: "anil-bhatnagar",
    email: "anil.bhatnagar@jyotish.studio",
    title: "Health Astrology Consultant",
    bio: "Anil ji specializes in remedial astrology for chronic health patterns, offering traditional remedies as a complement to ongoing medical treatment.",
    specialties: "Health, Chronic Health Patterns, Remedial Astrology",
    languages: "Hindi, Punjabi",
    consultationModes: "Audio, Video, Chat",
    experienceYears: 15,
    verified: true,
    verificationLevel: "verified-panel",
    photoUrl: null,
    chatRatePerMinute: 20,
    active: true,
    featured: false,
  },
  {
    name: "Kavita Nair",
    slug: "kavita-nair",
    email: "kavita.nair@jyotish.studio",
    title: "Wellness Through the Chart",
    bio: "Kavita focuses on mental wellness and stress patterns as seen through the chart, offering grounded, compassionate conversations alongside practical remedies.",
    specialties: "Health, Mental Wellness, Longevity Analysis",
    languages: "English, Malayalam, Hindi",
    consultationModes: "Video, Chat",
    experienceYears: 10,
    verified: true,
    verificationLevel: "verified-panel",
    photoUrl: null,
    chatRatePerMinute: 16,
    active: true,
    featured: false,
  },
  {
    name: "Ramesh Iyengar",
    slug: "ramesh-iyengar",
    email: "ramesh.iyengar@jyotish.studio",
    title: "Vitality & Longevity Jyotishi",
    bio: "Ramesh ji has two decades of experience reading longevity indicators and planetary health remedies, widely respected for his calm, thorough consultations.",
    specialties: "Health, Longevity, Planetary Health Remedies",
    languages: "Tamil, Telugu, Hindi",
    consultationModes: "Audio, Video, Chat",
    experienceYears: 20,
    verified: true,
    verificationLevel: "senior-panel",
    photoUrl: null,
    chatRatePerMinute: 25,
    active: true,
    featured: false,
  },

  // Family & Home (Vastu)
  {
    name: "Vinod Chaubey",
    slug: "vinod-chaubey",
    email: "vinod.chaubey@jyotish.studio",
    title: "Vastu Shastra Consultant",
    bio: "Vinod ji has consulted on Vastu for homes and offices for over two decades, focused on practical, non-structural remedies rather than costly renovations.",
    specialties: "Vastu, Home Harmony, Directional Remedies",
    languages: "Hindi, Sanskrit",
    consultationModes: "Audio, Video, Chat",
    experienceYears: 22,
    verified: true,
    verificationLevel: "senior-panel",
    photoUrl: "/images/practitioners/vinod-chaubey.jpg",
    chatRatePerMinute: 24,
    active: true,
    featured: false,
  },
  {
    name: "Naveen Malviya",
    slug: "naveen-malviya",
    email: "naveen.malviya@jyotish.studio",
    title: "Family Harmony Jyotishi",
    bio: "Naveen works with families navigating recurring friction at home, combining Vastu observations with chart-based guidance for a more settled household.",
    specialties: "Vastu, Family Harmony, Home Remedies",
    languages: "Hindi, Rajasthani",
    consultationModes: "Audio, Chat",
    experienceYears: 13,
    verified: true,
    verificationLevel: "verified-panel",
    photoUrl: null,
    chatRatePerMinute: 18,
    active: true,
    featured: false,
  },
  {
    name: "Sarita Agnihotri",
    slug: "sarita-agnihotri",
    email: "sarita.agnihotri@jyotish.studio",
    title: "Home & Family Astrologer",
    bio: "Sarita specializes in family dynamics and domestic peace, helping clients understand friction points between family members through combined chart reading.",
    specialties: "Vastu, Family Dynamics, Domestic Peace",
    languages: "Hindi, Marathi",
    consultationModes: "Video, Chat",
    experienceYears: 9,
    verified: true,
    verificationLevel: "verified-panel",
    photoUrl: null,
    chatRatePerMinute: 15,
    active: true,
    featured: false,
  },
  {
    name: "Prakash Bhatia",
    slug: "prakash-bhatia",
    email: "prakash.bhatia@jyotish.studio",
    title: "Vastu & Family Remedies Expert",
    bio: "Prakash consults on property purchases and layout concerns from a Vastu perspective, always deferring structural and safety questions to qualified engineers.",
    specialties: "Vastu, Property Astrology, Family Remedies",
    languages: "English, Hindi, Punjabi",
    consultationModes: "Video, Audio, Chat",
    experienceYears: 16,
    verified: true,
    verificationLevel: "verified-panel",
    photoUrl: null,
    chatRatePerMinute: 21,
    active: true,
    featured: false,
  },
  {
    name: "Lata Kulshreshtha",
    slug: "lata-kulshreshtha",
    email: "lata.kulshreshtha@jyotish.studio",
    title: "Domestic Harmony Specialist",
    bio: "Lata ji focuses on household energy and family wellbeing, offering simple, traditional remedies that fit into everyday life without major disruption.",
    specialties: "Vastu, Household Energy, Family Wellbeing",
    languages: "Hindi, Sanskrit",
    consultationModes: "Audio, Chat",
    experienceYears: 14,
    verified: true,
    verificationLevel: "verified-panel",
    photoUrl: null,
    chatRatePerMinute: 19,
    active: true,
    featured: false,
  },

  // Education
  {
    name: "Naresh Vyas",
    slug: "naresh-vyas",
    email: "naresh.vyas@jyotish.studio",
    title: "Education & Academic Jyotishi",
    bio: "Naresh ji has guided students and parents through exam timing and academic focus concerns for nearly two decades, drawing on 5th-house analysis and Saraswati yoga indicators.",
    specialties: "Education, Exam Timing, Academic Focus",
    languages: "Hindi, Sanskrit",
    consultationModes: "Audio, Video, Chat",
    experienceYears: 17,
    verified: true,
    verificationLevel: "verified-panel",
    photoUrl: null,
    chatRatePerMinute: 20,
    active: true,
    featured: false,
  },
  {
    name: "Poonam Sinha",
    slug: "poonam-sinha",
    email: "poonam.sinha@jyotish.studio",
    title: "Student Success Astrologer",
    bio: "Poonam works with students planning study-abroad timelines and major academic decisions, helping families choose windows that feel less rushed and more considered.",
    specialties: "Education, Study Abroad Timing, Academic Growth",
    languages: "English, Hindi, Bhojpuri",
    consultationModes: "Video, Chat",
    experienceYears: 8,
    verified: true,
    verificationLevel: "verified-panel",
    photoUrl: null,
    chatRatePerMinute: 14,
    active: true,
    featured: false,
  },
  {
    name: "Manoj Chatterjee",
    slug: "manoj-chatterjee",
    email: "manoj.chatterjee@jyotish.studio",
    title: "Academic Timing Specialist",
    bio: "Manoj specializes in competitive exam timing and focus remedies, widely consulted by students preparing for board exams and entrance tests.",
    specialties: "Education, Competitive Exam Timing, Focus Remedies",
    languages: "English, Bengali, Hindi",
    consultationModes: "Video, Audio, Chat",
    experienceYears: 12,
    verified: true,
    verificationLevel: "verified-panel",
    photoUrl: null,
    chatRatePerMinute: 18,
    active: true,
    featured: false,
  },
  {
    name: "Shweta Bapat",
    slug: "shweta-bapat",
    email: "shweta.bapat@jyotish.studio",
    title: "Education Astrology Consultant",
    bio: "Shweta works with parents navigating learning difficulties and academic milestones, offering grounded guidance alongside — not instead of — professional educational support.",
    specialties: "Education, Learning Difficulties, Academic Milestones",
    languages: "English, Hindi, Marathi",
    consultationModes: "Video, Chat",
    experienceYears: 10,
    verified: true,
    verificationLevel: "verified-panel",
    photoUrl: null,
    chatRatePerMinute: 16,
    active: true,
    featured: false,
  },
  {
    name: "Ravi Shankar Pillai",
    slug: "ravi-shankar-pillai",
    email: "ravishankar.pillai@jyotish.studio",
    title: "Learning & Focus Jyotishi",
    bio: "Ravi Shankar ji has nearly two decades of experience helping students with concentration remedies and guidance on career direction after their studies.",
    specialties: "Education, Concentration Remedies, Career-after-Education Guidance",
    languages: "Tamil, Malayalam, Hindi",
    consultationModes: "Audio, Video, Chat",
    experienceYears: 19,
    verified: true,
    verificationLevel: "verified-panel",
    photoUrl: null,
    chatRatePerMinute: 22,
    active: true,
    featured: false,
  },
];

export async function seedPractitioners() {
  const collection = db.collection("practitioners");
  for (const starter of starterPractitioners) {
    const ref = collection.doc(starter.slug);
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set({
        ...starter,
        firebaseUid: null,
        online: false,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      // photoUrl is deliberately excluded from this always-on update — it's an admin/practitioner
      // editable field (see updatePractitionerProfile), so blindly overwriting it here on every
      // directory fetch would silently revert a real uploaded photo back to the seed default.
      // Backfilling it only when the existing doc has none lets a newly-added seed photo reach
      // practitioners that were already seeded (e.g. in production) without ever touching one
      // that's already set.
      const existingPhotoUrl = (snap.data() as { photoUrl?: string | null }).photoUrl ?? null;
      await ref.update({
        title: starter.title,
        bio: starter.bio,
        specialties: starter.specialties,
        languages: starter.languages,
        consultationModes: starter.consultationModes,
        experienceYears: starter.experienceYears,
        verified: starter.verified,
        verificationLevel: starter.verificationLevel,
        chatRatePerMinute: starter.chatRatePerMinute,
        featured: starter.featured,
        ...(existingPhotoUrl ? {} : { photoUrl: starter.photoUrl }),
      });
    }

    const rulesSnap = await ref.collection("availabilityRules").limit(1).get();
    if (rulesSnap.empty) {
      const weekdays = starter.featured ? [1, 2, 3, 4, 5] : [2, 3, 4, 5, 6];
      const batch = db.batch();
      for (const weekday of weekdays) {
        batch.set(ref.collection("availabilityRules").doc(), { weekday, startTime: "09:30", endTime: "17:30", active: true });
      }
      await batch.commit();
    }
  }
}

function practitionerFromDoc(doc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot): Practitioner {
  const data = doc.data() as Record<string, unknown>;
  return {
    id: doc.id,
    name: data.name as string,
    slug: data.slug as string,
    email: data.email as string,
    title: data.title as string,
    bio: data.bio as string,
    specialties: data.specialties as string,
    languages: data.languages as string,
    consultationModes: data.consultationModes as string,
    experienceYears: data.experienceYears as number,
    verified: data.verified as boolean,
    verificationLevel: data.verificationLevel as string,
    photoUrl: (data.photoUrl as string | null) ?? null,
    online: (data.online as boolean) ?? false,
    chatRatePerMinute: data.chatRatePerMinute as number,
    active: data.active as boolean,
    featured: data.featured as boolean,
    firebaseUid: (data.firebaseUid as string | null) ?? null,
    hasPortalAccess: Boolean(data.firebaseUid),
    lastLoginAt: (data.lastLoginAt as FirebaseFirestore.Timestamp | undefined)?.toDate() ?? null,
    createdAt: (data.createdAt as FirebaseFirestore.Timestamp | undefined)?.toDate() ?? new Date(),
    updatedAt: (data.updatedAt as FirebaseFirestore.Timestamp | undefined)?.toDate() ?? new Date(),
  };
}

export type PractitionerWithSchedule = Practitioner & { rules: AvailabilityRule[]; timeOff: PractitionerTimeOff[] };

export async function getPractitionerDirectory(activeOnly = false): Promise<PractitionerWithSchedule[]> {
  await seedPractitioners();
  const collection = db.collection("practitioners");
  const query = activeOnly ? collection.where("active", "==", true) : collection;
  // Falls back to an unsorted read (then sorts in JS) if the (active, name) composite index
  // isn't built yet, so a fresh deploy shows practitioners out of order instead of a 500.
  let docs: FirebaseFirestore.QueryDocumentSnapshot[];
  try {
    docs = (await query.orderBy("name", "asc").get()).docs;
  } catch (error) {
    if (!isIndexBuildingError(error)) throw error;
    console.error("Firestore composite index unavailable for practitioners directory, sorting in JS:", error);
    docs = (await query.get()).docs.sort((a, b) => (a.data().name as string).localeCompare(b.data().name as string));
  }
  if (!docs.length) return [];

  const now = new Date();
  return Promise.all(
    docs.map(async (doc) => {
      const person = practitionerFromDoc(doc);
      const [rulesSnap, timeOffSnap] = await Promise.all([
        // Falls back to unsorted (then sorts in JS) if the (weekday, startTime) composite index
        // isn't built yet — a practitioner's own weekly schedule editor still needs correct
        // ordering, but the public directory just needs *some* rules, so this degrades safely.
        (async () => {
          try {
            return await doc.ref.collection("availabilityRules").orderBy("weekday", "asc").orderBy("startTime", "asc").get();
          } catch (error) {
            if (!isIndexBuildingError(error)) throw error;
            const snap = await doc.ref.collection("availabilityRules").get();
            snap.docs.sort((a, b) => (a.data().weekday as number) - (b.data().weekday as number) || (a.data().startTime as string).localeCompare(b.data().startTime as string));
            return snap;
          }
        })(),
        doc.ref.collection("timeOff").where("endsAt", ">=", now).orderBy("endsAt", "asc").get(),
      ]);
      return {
        ...person,
        rules: rulesSnap.docs.map((r) => ({ id: r.id, practitionerId: doc.id, ...(r.data() as Omit<AvailabilityRule, "id" | "practitionerId">) })),
        timeOff: timeOffSnap.docs.map((t) => {
          const data = t.data();
          // Only endsAt is guaranteed present here (it's the query's own range filter) — startsAt isn't.
          return { id: t.id, practitionerId: doc.id, reason: data.reason ?? null, startsAt: (data.startsAt as FirebaseFirestore.Timestamp | undefined)?.toDate() ?? data.endsAt.toDate(), endsAt: (data.endsAt as FirebaseFirestore.Timestamp).toDate() };
        }),
      };
    }),
  );
}

export class PractitionerAdminError extends Error {}

function toPractitionerSlug(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 100);
}

/** Practitioners previously could only be onboarded by inviting an email to an *existing*
 * Firestore doc — there was no way to create that doc from the admin UI at all, so a new
 * practitioner had to be added by hand (a seed script) before an invite could even be sent.
 * This creates the base record; the practitioner still needs a portal invite (see
 * practitioner-invites.ts) before they can sign in and self-manage their profile. */
export async function createPractitionerAdmin(input: {
  name: string; email: string; title: string; bio: string; specialties: string; languages: string;
  consultationModes: string; experienceYears: number; chatRatePerMinute: number; photoUrl: string | null;
  featured: boolean; active: boolean;
}) {
  const name = input.name.trim().slice(0, 120);
  const email = input.email.trim().toLowerCase().slice(0, 180);
  if (name.length < 2) throw new PractitionerAdminError("Enter the practitioner's name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new PractitionerAdminError("Enter a valid email address.");

  const collection = db.collection("practitioners");
  const emailTaken = await collection.where("email", "==", email).limit(1).get();
  if (!emailTaken.empty) throw new PractitionerAdminError("A practitioner with that email already exists.");

  const base = toPractitionerSlug(name) || "practitioner";
  let slug = base;
  for (let attempt = 0; (await collection.doc(slug).get()).exists; attempt += 1) {
    slug = `${base}-${attempt + 2}`;
    if (attempt > 20) throw new PractitionerAdminError("Could not generate a unique profile URL — try a different name.");
  }

  const doc = {
    name,
    slug,
    email,
    title: input.title.trim().slice(0, 160),
    bio: input.bio.trim().slice(0, 2000),
    specialties: input.specialties.trim().slice(0, 300),
    languages: input.languages.trim().slice(0, 200),
    consultationModes: input.consultationModes.trim().slice(0, 200),
    experienceYears: Math.max(0, Math.min(60, Number(input.experienceYears) || 0)),
    verified: false,
    verificationLevel: "unverified",
    photoUrl: input.photoUrl?.trim() || null,
    online: false,
    chatRatePerMinute: Math.max(0, Number(input.chatRatePerMinute) || 0),
    active: input.active,
    featured: input.featured,
    firebaseUid: null,
  };
  const ref = collection.doc(slug);
  await ref.set({ ...doc, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  return practitionerFromDoc(await ref.get());
}

export async function updatePractitionerAdmin(id: string, patch: Partial<{
  name: string; title: string; bio: string; specialties: string; languages: string; consultationModes: string;
  experienceYears: number; chatRatePerMinute: number; photoUrl: string | null; verified: boolean; featured: boolean; active: boolean;
}>) {
  const ref = db.collection("practitioners").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new PractitionerAdminError("Practitioner not found.");

  const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (patch.name !== undefined) {
    const name = patch.name.trim().slice(0, 120);
    if (name.length < 2) throw new PractitionerAdminError("Enter the practitioner's name.");
    update.name = name;
  }
  if (patch.title !== undefined) update.title = patch.title.trim().slice(0, 160);
  if (patch.bio !== undefined) update.bio = patch.bio.trim().slice(0, 2000);
  if (patch.specialties !== undefined) update.specialties = patch.specialties.trim().slice(0, 300);
  if (patch.languages !== undefined) update.languages = patch.languages.trim().slice(0, 200);
  if (patch.consultationModes !== undefined) update.consultationModes = patch.consultationModes.trim().slice(0, 200);
  if (patch.experienceYears !== undefined) update.experienceYears = Math.max(0, Math.min(60, Number(patch.experienceYears) || 0));
  if (patch.chatRatePerMinute !== undefined) update.chatRatePerMinute = Math.max(0, Number(patch.chatRatePerMinute) || 0);
  if (patch.photoUrl !== undefined) update.photoUrl = patch.photoUrl?.trim() || null;
  if (patch.verified !== undefined) update.verified = patch.verified;
  if (patch.featured !== undefined) update.featured = patch.featured;
  if (patch.active !== undefined) update.active = patch.active;

  await ref.update(update);
  return practitionerFromDoc(await ref.get());
}

/** Hard-deletes a practitioner that never received any real activity (no bookings, no reviews) —
 * once real bookings/reviews/payouts point at this id, deleting the doc would orphan that
 * history, so those should be deactivated (active: false) instead via updatePractitionerAdmin. */
export async function deletePractitionerAdmin(id: string) {
  const ref = db.collection("practitioners").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new PractitionerAdminError("Practitioner not found.");

  const [bookings, reviews] = await Promise.all([
    db.collection("bookings").where("practitionerId", "==", id).limit(1).get(),
    db.collection("practitionerReviews").where("practitionerId", "==", id).limit(1).get(),
  ]);
  if (!bookings.empty || !reviews.empty) {
    throw new PractitionerAdminError("This practitioner has bookings or reviews on record — deactivate instead of deleting.");
  }

  const [rulesSnap, timeOffSnap] = await Promise.all([ref.collection("availabilityRules").get(), ref.collection("timeOff").get()]);
  const batch = db.batch();
  for (const doc of rulesSnap.docs) batch.delete(doc.ref);
  for (const doc of timeOffSnap.docs) batch.delete(doc.ref);
  batch.delete(ref);
  await batch.commit();
}

export function dateInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function civilToUtc(date: string, time: string, timeZone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute);
  let instant = desired;
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  for (let index = 0; index < 2; index += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
    const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    instant -= represented - desired;
  }
  return new Date(instant);
}

function minutes(value: string) {
  const [hours, mins] = value.split(":").map(Number);
  return hours * 60 + mins;
}

function timeFromMinutes(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function overlaps(startA: Date, endA: Date, startB: Date, endB: Date) {
  return startA < endB && endA > startB;
}

export type AvailableSlot = {
  practitionerId: string;
  practitionerName: string;
  startsAt: string;
  label: string;
};

type BookingForConflictCheck = { id: string; practitionerId: string | null; status: string; scheduledAt: Date; serviceDuration: number };

export async function getAvailableSlots({ date, duration, practitionerId, excludeBookingId }: { date: string; duration: number; practitionerId?: string; excludeBookingId?: string }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { slots: [] as AvailableSlot[], practitioners: [] as Omit<PractitionerWithSchedule, "rules" | "timeOff">[], timezone: "UTC" };
  const [settings, directory] = await Promise.all([getStudioSettings(), getPractitionerDirectory(true)]);
  const people = practitionerId ? directory.filter((person) => person.id === practitionerId) : directory;
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const dayStart = civilToUtc(date, "00:00", settings.timezone);
  const dayEnd = civilToUtc(date, "23:59", settings.timezone);

  const bookingsSnap = await db.collection("bookings")
    .where("scheduledAt", ">=", new Date(dayStart.getTime() - 12 * 3600000))
    .where("scheduledAt", "<", new Date(dayEnd.getTime() + 12 * 3600000))
    .get();
  const existingBookings: BookingForConflictCheck[] = bookingsSnap.docs.map((doc) => {
    const data = doc.data();
    return { id: doc.id, practitionerId: data.practitionerId ?? null, status: data.status, scheduledAt: (data.scheduledAt as FirebaseFirestore.Timestamp).toDate(), serviceDuration: data.serviceDuration };
  });

  const slots: AvailableSlot[] = [];
  for (const person of people) {
    const personBookings = existingBookings.filter((booking) => booking.id !== excludeBookingId && booking.practitionerId === person.id && booking.status !== "cancelled");
    const rules = person.rules.filter((rule) => rule.weekday === weekday && rule.active);
    for (const rule of rules) {
      for (let cursor = minutes(rule.startTime); cursor + duration <= minutes(rule.endTime); cursor += 30) {
        const startsAt = civilToUtc(date, timeFromMinutes(cursor), settings.timezone);
        const endsAt = new Date(startsAt.getTime() + duration * 60000);
        if (startsAt.getTime() < Date.now() + settings.bookingLeadMinutes * 60000) continue;
        const blockedByBooking = personBookings.some((booking) => overlaps(startsAt, endsAt, booking.scheduledAt, new Date(booking.scheduledAt.getTime() + booking.serviceDuration * 60000)));
        const blockedByTimeOff = person.timeOff.some((item) => overlaps(startsAt, endsAt, item.startsAt, item.endsAt));
        if (!blockedByBooking && !blockedByTimeOff) {
          slots.push({ practitionerId: person.id, practitionerName: person.name, startsAt: startsAt.toISOString(), label: startsAt.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit", timeZone: settings.timezone }) });
        }
      }
    }
  }
  return { slots: slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt)), practitioners: people.map(({ rules, timeOff, ...person }) => person), timezone: settings.timezone };
}

export async function validateAvailableSlot({ date, duration, practitionerId, startsAt, excludeBookingId }: { date: string; duration: number; practitionerId: string; startsAt: Date; excludeBookingId?: string }) {
  const result = await getAvailableSlots({ date, duration, practitionerId, excludeBookingId });
  return result.slots.find((slot) => slot.practitionerId === practitionerId && slot.startsAt === startsAt.toISOString()) ?? null;
}
