import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { db, isIndexBuildingError } from "@/lib/firestore";
import { getBookingsInWindowInSupabase } from "@/lib/bookings-supabase";
import {
  deleteUnusedPractitionerInSupabase,
  getPractitionerByIdInSupabase,
  getPractitionerDirectoryInSupabase,
  insertPractitionerInSupabase,
  PractitionerEmailTakenError,
  updatePractitionerInSupabase,
  type PractitionerInsert,
} from "@/lib/practitioners-supabase";
import { isSupabaseCutoverActive } from "@/lib/supabase-config";
import { getStudioSettings } from "@/lib/studio-settings";

/** Same allowlist as notifications.ts's sanitizeLink: a site-relative path, or an https:// URL —
 * never javascript:/data:/vbscript:. Practitioner photoUrl/videoUrl previously stored whatever
 * string was submitted with only length trimming, unlike every other user-suppliable
 * link/URL field in the codebase. */
export function sanitizeMediaUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed.slice(0, 500);
  try {
    return new URL(trimmed).protocol === "https:" ? trimmed.slice(0, 500) : null;
  } catch {
    return null;
  }
}

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
  videoUrl: string | null;
  online: boolean;
  isAiPowered: boolean;
  chatRatePerMinute: number;
  active: boolean;
  featured: boolean;
  isDemoAccount: boolean;
  firebaseUid: string | null;
  hasPortalAccess: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AvailabilityRule = { id: string; practitionerId: string; weekday: number; startTime: string; endTime: string; active: boolean };
export type PractitionerTimeOff = { id: string; practitionerId: string; startsAt: Date; endsAt: Date; reason: string | null };

const starterPractitioners: Array<Omit<Practitioner, "id" | "firebaseUid" | "hasPortalAccess" | "lastLoginAt" | "createdAt" | "updatedAt" | "online" | "isDemoAccount" | "isAiPowered">> = [
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
    videoUrl: null,
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
    videoUrl: null,
    chatRatePerMinute: 109,
    active: true,
    featured: true,
  },
  {
    name: "Anika Sharma",
    slug: "anika-sharma",
    email: "anika@jyotish.studio",
    title: "Vedic Astrologer",
    bio: "Anika brings classical Parashari technique into grounded conversations about purpose, timing, and visible growth.",
    specialties: "Birth charts, Career & dharma, Planetary periods",
    languages: "English, Hindi, Sanskrit",
    consultationModes: "Video, Audio, Chat",
    experienceYears: 14,
    verified: true,
    verificationLevel: "senior-panel",
    photoUrl: "/images/practitioners/anika-sharma.jpg",
    videoUrl: null,
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
    videoUrl: null,
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
    videoUrl: null,
    chatRatePerMinute: 18,
    active: true,
    featured: false,
  },
  {
    name: "Ravindra Bhatt",
    slug: "ravindra-bhatt",
    email: "ravindra.bhatt@jyotish.studio",
    title: "Prem aur Rishtey Visheshagya",
    bio: "Ravindra ji helps clients navigate love, courtship, and long-distance relationships through classical Jyotish, with a practical focus on timing and honest communication.",
    specialties: "Relationships, Prem Vivah, Love Astrology, Timing Guidance",
    languages: "Hindi, Gujarati",
    consultationModes: "Audio, Chat",
    experienceYears: 16,
    verified: true,
    verificationLevel: "verified-panel",
    photoUrl: "/images/practitioners/ravindra-bhatt.jpg",
    videoUrl: null,
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
    videoUrl: null,
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
    videoUrl: null,
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
    videoUrl: null,
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
    bio: "Harish ji guides families through kundli milan and vivah muhurat selection, blending classical Ashtakoot matching with honest conversation about real compatibility.",
    specialties: "Marriage, Kundli Milan, Vivah Muhurat, Ashtakoot Matching",
    languages: "Hindi, Sanskrit",
    consultationModes: "Audio, Video, Chat",
    experienceYears: 19,
    verified: true,
    verificationLevel: "verified-panel",
    photoUrl: "/images/practitioners/harish-shukla.jpg",
    videoUrl: null,
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
    videoUrl: null,
    chatRatePerMinute: 18,
    active: true,
    featured: false,
  },
  {
    name: "Om Prakash Tiwari",
    slug: "om-prakash-tiwari",
    email: "omprakash.tiwari@jyotish.studio",
    title: "Marriage & Muhurat Expert",
    bio: "Om Prakash ji focuses on precise vivah muhurat selection and practical remedies for dosha concerns raised before marriage.",
    specialties: "Marriage, Vivah Muhurat, Dosha Remedies, Panchang",
    languages: "Hindi, Bhojpuri",
    consultationModes: "Audio, Chat",
    experienceYears: 21,
    verified: true,
    verificationLevel: "senior-panel",
    photoUrl: "/images/practitioners/om-prakash-tiwari.jpg",
    videoUrl: null,
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
    photoUrl: "/images/practitioners/kavita-joshi.jpg",
    videoUrl: null,
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
    videoUrl: null,
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
    photoUrl: "/images/practitioners/rajesh-malhotra.jpg",
    videoUrl: null,
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
    videoUrl: null,
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
    videoUrl: null,
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
    photoUrl: "/images/practitioners/ashok-bhargava.jpg",
    videoUrl: null,
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
    photoUrl: "/images/practitioners/priya-ramachandran.jpg",
    videoUrl: null,
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
    photoUrl: "/images/practitioners/mahesh-awasthi.jpg",
    videoUrl: null,
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
    videoUrl: null,
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
    videoUrl: null,
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
    photoUrl: "/images/practitioners/kavita-nair.jpg",
    videoUrl: null,
    chatRatePerMinute: 16,
    active: true,
    featured: false,
  },
  {
    name: "Ramesh Iyengar",
    slug: "ramesh-iyengar",
    email: "ramesh.iyengar@jyotish.studio",
    title: "Vitality & Longevity Jyotishi",
    bio: "Ramesh ji reads longevity indicators and planetary health remedies in calm, thorough conversations.",
    specialties: "Health, Longevity, Planetary Health Remedies",
    languages: "Tamil, Telugu, Hindi",
    consultationModes: "Audio, Video, Chat",
    experienceYears: 20,
    verified: true,
    verificationLevel: "senior-panel",
    photoUrl: null,
    videoUrl: null,
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
    bio: "Vinod ji advises on Vastu for homes and offices, focused on practical, non-structural remedies rather than costly renovations.",
    specialties: "Vastu, Home Harmony, Directional Remedies",
    languages: "Hindi, Sanskrit",
    consultationModes: "Audio, Video, Chat",
    experienceYears: 22,
    verified: true,
    verificationLevel: "senior-panel",
    photoUrl: "/images/practitioners/vinod-chaubey.jpg",
    videoUrl: null,
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
    videoUrl: null,
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
    photoUrl: "/images/practitioners/sarita-agnihotri.jpg",
    videoUrl: null,
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
    videoUrl: null,
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
    photoUrl: "/images/practitioners/lata-kulshreshtha.jpg",
    videoUrl: null,
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
    bio: "Naresh ji guides students and parents through exam timing and academic focus concerns, drawing on 5th-house analysis and Saraswati yoga indicators.",
    specialties: "Education, Exam Timing, Academic Focus",
    languages: "Hindi, Sanskrit",
    consultationModes: "Audio, Video, Chat",
    experienceYears: 17,
    verified: true,
    verificationLevel: "verified-panel",
    photoUrl: "/images/practitioners/naresh-vyas.jpg",
    videoUrl: null,
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
    photoUrl: "/images/practitioners/poonam-sinha.jpg",
    videoUrl: null,
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
    photoUrl: "/images/practitioners/manoj-chatterjee.jpg",
    videoUrl: null,
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
    photoUrl: "/images/practitioners/shweta-bapat.jpg",
    videoUrl: null,
    chatRatePerMinute: 16,
    active: true,
    featured: false,
  },
  {
    name: "Ravi Shankar Pillai",
    slug: "ravi-shankar-pillai",
    email: "ravishankar.pillai@jyotish.studio",
    title: "Learning & Focus Jyotishi",
    bio: "Ravi Shankar ji helps students with concentration remedies and guidance on career direction after their studies.",
    specialties: "Education, Concentration Remedies, Career-after-Education Guidance",
    languages: "Tamil, Malayalam, Hindi",
    consultationModes: "Audio, Video, Chat",
    experienceYears: 19,
    verified: true,
    verificationLevel: "verified-panel",
    photoUrl: null,
    videoUrl: null,
    chatRatePerMinute: 22,
    active: true,
    featured: false,
  },
];

// Only the two senior-panel founders (44/38 years' real experience, the studio's original hires)
// are actual humans who log into the practitioner portal and toggle their own online status. Every
// other seeded profile is Gemini-backed (see getChatPersonaSystemPrompt/maybeSendAiChatReply in
// chat.ts) — they have no person to log in and flip online, so seeding forces them online instead
// of leaving them stuck at the false default forever.
const REAL_PRACTITIONER_SLUGS = new Set(["jagmohan-shashtri-ji", "arun-dubey-ji"]);

/**
 * Starter copy that was published and later corrected — every AI persona above once claimed years
 * of experience or seniority it cannot have. A stored field still holding the old text has never
 * been edited, so it is safe to replace; anything else is someone's edit and is left alone.
 */
const SUPERSEDED_STARTER_COPY: Array<{ slug: string; field: "title" | "bio"; text: string }> = [
  { slug: "anika-sharma", field: "title", text: "Senior Vedic Astrologer" },
  { slug: "ravindra-bhatt", field: "bio", text: "Ravindra ji has spent over a decade helping clients navigate love, courtship, and long-distance relationships through classical Jyotish, with a practical focus on timing and honest communication." },
  { slug: "harish-shukla", field: "bio", text: "Harish ji has guided hundreds of families through kundli milan and vivah muhurat selection, blending classical Ashtakoot matching with honest conversation about real compatibility." },
  { slug: "om-prakash-tiwari", field: "bio", text: "With over two decades of experience, Om Prakash ji is known for precise vivah muhurat selection and practical remedies for dosha concerns raised before marriage." },
  { slug: "ramesh-iyengar", field: "bio", text: "Ramesh ji has two decades of experience reading longevity indicators and planetary health remedies, widely respected for his calm, thorough consultations." },
  { slug: "vinod-chaubey", field: "bio", text: "Vinod ji has consulted on Vastu for homes and offices for over two decades, focused on practical, non-structural remedies rather than costly renovations." },
  { slug: "naresh-vyas", field: "bio", text: "Naresh ji has guided students and parents through exam timing and academic focus concerns for nearly two decades, drawing on 5th-house analysis and Saraswati yoga indicators." },
  { slug: "ravi-shankar-pillai", field: "bio", text: "Ravi Shankar ji has nearly two decades of experience helping students with concentration remedies and guidance on career direction after their studies." },
];

/** Admin-deleted starter practitioners; seeding never recreates one listed here. */
export const DELETED_STARTER_COLLECTION = "deletedStarterPractitioners";

export function isStarterPractitioner(id: string) {
  return starterPractitioners.some((starter) => starter.slug === id);
}

/**
 * Creates any starter practitioner that does not exist yet, and otherwise changes only what no
 * person owns. This runs on every directory read, so it used to be the thing reverting admins:
 * it rewrote title, bio, rates, verification and featured on all 34 starters each time — including
 * inside the admin update route itself, whose response came back with the edit already undone —
 * recreated starters an admin had deleted, and re-added weekday hours to any starter whose
 * availability had been cleared.
 *
 * For an existing starter it now only: keeps isAiPowered true to the roster, keeps AI personas
 * online (there is nobody to switch them on), fills a missing photo, and replaces copy listed in
 * SUPERSEDED_STARTER_COPY that has not been edited since. Writes happen only when something
 * differs, and all 34 documents are read in one round trip.
 */
export async function seedPractitioners() {
  const collection = db.collection("practitioners");
  const refs = starterPractitioners.map((starter) => collection.doc(starter.slug));
  const [snaps, deleted] = await Promise.all([
    db.getAll(...refs),
    db.collection(DELETED_STARTER_COLLECTION).select().get(),
  ]);
  const deletedIds = new Set(deleted.docs.map((doc) => doc.id));

  await Promise.all(starterPractitioners.map(async (starter, index) => {
    const isAiPowered = !REAL_PRACTITIONER_SLUGS.has(starter.slug);
    const ref = refs[index];
    const snap = snaps[index];

    if (!snap.exists) {
      if (deletedIds.has(starter.slug)) return;
      // Availability is written with the profile, once. After that it belongs to the schedule
      // editor, and an empty schedule is a choice, not something to repair.
      const weekdays = starter.featured ? [1, 2, 3, 4, 5] : [2, 3, 4, 5, 6];
      const batch = db.batch();
      // create() rather than set(): two concurrent first reads both see the document missing, and
      // the loser must not overwrite what the winner wrote.
      batch.create(ref, {
        ...starter,
        firebaseUid: null,
        isAiPowered,
        online: isAiPowered,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      for (const weekday of weekdays) {
        batch.set(ref.collection("availabilityRules").doc(`starter-${weekday}`), { weekday, startTime: "09:30", endTime: "17:30", active: true });
      }
      await batch.commit().catch((error: unknown) => {
        // gRPC ALREADY_EXISTS: a concurrent read created it first.
        if ((error as { code?: number }).code !== 6) throw error;
      });
      return;
    }

    const data = snap.data() as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if (data.isAiPowered !== isAiPowered) patch.isAiPowered = isAiPowered;
    if (isAiPowered && data.online !== true) patch.online = true;
    if (!data.photoUrl && starter.photoUrl) patch.photoUrl = starter.photoUrl;
    for (const superseded of SUPERSEDED_STARTER_COPY) {
      if (superseded.slug === starter.slug && data[superseded.field] === superseded.text) {
        patch[superseded.field] = starter[superseded.field];
      }
    }
    if (Object.keys(patch).length) await ref.update(patch);
  }));
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
    videoUrl: (data.videoUrl as string | null) ?? null,
    online: (data.online as boolean) ?? false,
    isAiPowered: Boolean(data.isAiPowered),
    chatRatePerMinute: data.chatRatePerMinute as number,
    active: data.active as boolean,
    featured: data.featured as boolean,
    isDemoAccount: Boolean(data.isDemoAccount),
    firebaseUid: (data.firebaseUid as string | null) ?? null,
    hasPortalAccess: Boolean(data.firebaseUid),
    lastLoginAt: (data.lastLoginAt as FirebaseFirestore.Timestamp | undefined)?.toDate() ?? null,
    createdAt: (data.createdAt as FirebaseFirestore.Timestamp | undefined)?.toDate() ?? new Date(),
    updatedAt: (data.updatedAt as FirebaseFirestore.Timestamp | undefined)?.toDate() ?? new Date(),
  };
}

export type PractitionerWithSchedule = Practitioner & { rules: AvailabilityRule[]; timeOff: PractitionerTimeOff[] };

export async function getPractitionerDirectory(activeOnly = false, includeDemo = false): Promise<PractitionerWithSchedule[]> {
  if (isSupabaseCutoverActive()) {
    // Seeding writes the demo practitioners into Firestore. Under cutover the
    // directory was copied wholesale, so seeding would only create rows in a
    // database nothing reads any more.
    return getPractitionerDirectoryInSupabase(activeOnly, includeDemo);
  }
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
  // Demo accounts are only for internal testing (see api/admin/demo-accounts/route.ts) — filtered
  // in JS rather than via a Firestore `isDemoAccount != true` query, since Firestore's `!=`
  // excludes docs where the field is unset at all, which would wrongly drop every real practitioner.
  if (!includeDemo) docs = docs.filter((doc) => !doc.data().isDemoAccount);
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

export type PractitionerProfilePatch = Partial<{
  name: string; email: string; title: string; bio: string; specialties: string; languages: string; consultationModes: string;
  experienceYears: number; chatRatePerMinute: number; photoUrl: string | null; videoUrl: string | null;
  verified: boolean; verificationLevel: string; online: boolean; featured: boolean; active: boolean;
}>;

/** One set of rules for every admin surface that edits a practitioner (the Practitioners page and
 * the Schedule page used to carry two, with different limits and different delete behaviour). */
function normalizeProfilePatch(patch: PractitionerProfilePatch) {
  const out: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim().slice(0, 120);
    if (name.length < 2) throw new PractitionerAdminError("Enter the practitioner's name.");
    out.name = name;
  }
  if (patch.email !== undefined) {
    const email = patch.email.trim().toLowerCase().slice(0, 180);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new PractitionerAdminError("Enter a valid email address.");
    out.email = email;
  }
  if (patch.title !== undefined) out.title = patch.title.trim().slice(0, 160);
  if (patch.bio !== undefined) out.bio = patch.bio.trim().slice(0, 2000);
  if (patch.specialties !== undefined) out.specialties = patch.specialties.trim().slice(0, 300);
  if (patch.languages !== undefined) out.languages = patch.languages.trim().slice(0, 200);
  if (patch.consultationModes !== undefined) out.consultationModes = patch.consultationModes.trim().slice(0, 200);
  if (patch.experienceYears !== undefined) out.experienceYears = Math.max(0, Math.min(60, Number(patch.experienceYears) || 0));
  if (patch.chatRatePerMinute !== undefined) out.chatRatePerMinute = Math.max(0, Number(patch.chatRatePerMinute) || 0);
  if (patch.photoUrl !== undefined) out.photoUrl = sanitizeMediaUrl(patch.photoUrl ?? undefined);
  if (patch.videoUrl !== undefined) out.videoUrl = sanitizeMediaUrl(patch.videoUrl ?? undefined);
  if (patch.verified !== undefined) out.verified = Boolean(patch.verified);
  if (patch.verificationLevel !== undefined) out.verificationLevel = patch.verificationLevel.trim().slice(0, 40) || "reviewed";
  if (patch.online !== undefined) out.online = Boolean(patch.online);
  if (patch.featured !== undefined) out.featured = Boolean(patch.featured);
  if (patch.active !== undefined) out.active = Boolean(patch.active);
  return out;
}

/** One practitioner by id (their slug) from the live provider, or null. */
export async function getPractitionerById(id: string): Promise<Practitioner | null> {
  if (isSupabaseCutoverActive()) return getPractitionerByIdInSupabase(id);
  const snap = await db.collection("practitioners").doc(id).get();
  return snap.exists ? practitionerFromDoc(snap) : null;
}

/** Practitioners previously could only be onboarded by inviting an email to an *existing*
 * record — there was no way to create one from the admin UI at all. This creates the base
 * record; the practitioner still needs a portal invite (see practitioner-invites.ts) before they
 * can sign in and self-manage their profile. `starterHours` adds weekday 09:30-17:30 availability,
 * which the Schedule page promises; the Practitioners page leaves hours to be set explicitly. */
export async function createPractitionerAdmin(
  input: { name: string; email: string } & PractitionerProfilePatch,
  options: { starterHours?: boolean } = {},
): Promise<Practitioner> {
  const fields = normalizeProfilePatch({ ...input, name: input.name, email: input.email });
  const record = {
    title: "", bio: "", specialties: "", languages: "", consultationModes: "", experienceYears: 0,
    chatRatePerMinute: 0, photoUrl: null, videoUrl: null, verified: false, verificationLevel: "unverified",
    online: false, featured: false, active: false,
    ...fields,
    isAiPowered: false,
  } as Omit<PractitionerInsert, "slug"> & { name: string; email: string };
  const base = toPractitionerSlug(record.name) || "practitioner";
  const weekdays = options.starterHours ? [1, 2, 3, 4, 5] : [];

  if (isSupabaseCutoverActive()) {
    try {
      const id = await insertPractitionerInSupabase({ ...record, slug: base }, weekdays);
      return (await getPractitionerByIdInSupabase(id))!;
    } catch (error) {
      if (error instanceof PractitionerEmailTakenError) throw new PractitionerAdminError(error.message);
      throw error;
    }
  }

  const collection = db.collection("practitioners");
  const emailTaken = await collection.where("email", "==", record.email).limit(1).get();
  if (!emailTaken.empty) throw new PractitionerAdminError("A practitioner with that email already exists.");

  let slug = base;
  for (let attempt = 0; (await collection.doc(slug).get()).exists; attempt += 1) {
    slug = `${base}-${attempt + 2}`;
    if (attempt > 20) throw new PractitionerAdminError("Could not generate a unique profile URL — try a different name.");
  }
  const ref = collection.doc(slug);
  const batch = db.batch();
  batch.create(ref, { ...record, slug, firebaseUid: null, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  for (const weekday of weekdays) {
    batch.set(ref.collection("availabilityRules").doc(`starter-${weekday}`), { weekday, startTime: "09:30", endTime: "17:30", active: true });
  }
  await batch.commit();
  return practitionerFromDoc(await ref.get());
}

export async function updatePractitionerAdmin(id: string, patch: PractitionerProfilePatch): Promise<Practitioner> {
  const current = await getPractitionerById(id);
  if (!current) throw new PractitionerAdminError("Practitioner not found.");
  const update = normalizeProfilePatch(patch);
  // Nobody can switch an AI persona on, so it cannot be switched off either; seedPractitioners
  // would only switch it back.
  if (current.isAiPowered) delete update.online;

  if (isSupabaseCutoverActive()) {
    try {
      await updatePractitionerInSupabase(id, update as Partial<PractitionerInsert>);
    } catch (error) {
      if (error instanceof PractitionerEmailTakenError) throw new PractitionerAdminError(error.message);
      throw error;
    }
    return (await getPractitionerByIdInSupabase(id))!;
  }

  if (typeof update.email === "string" && update.email !== current.email) {
    const owner = await db.collection("practitioners").where("email", "==", update.email).limit(1).get();
    if (!owner.empty && owner.docs[0].id !== id) throw new PractitionerAdminError("That email belongs to another practitioner.");
  }
  const ref = db.collection("practitioners").doc(id);
  await ref.update({ ...update, updatedAt: FieldValue.serverTimestamp() });
  return practitionerFromDoc(await ref.get());
}

/** Hard-deletes a practitioner that never received any real activity (no bookings, no reviews) —
 * once real bookings/reviews/payouts point at this id, deleting would orphan that history (or, on
 * Postgres, cascade the reviews away), so those should be deactivated (active: false) instead. */
export async function deletePractitionerAdmin(id: string) {
  const inUse = "This practitioner has bookings or reviews on record — deactivate instead of deleting.";
  if (isSupabaseCutoverActive()) {
    const outcome = await deleteUnusedPractitionerInSupabase(id);
    if (outcome === "not_found") throw new PractitionerAdminError("Practitioner not found.");
    if (outcome === "has_history") throw new PractitionerAdminError(inUse);
    return;
  }

  const ref = db.collection("practitioners").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new PractitionerAdminError("Practitioner not found.");
  const [bookings, reviews] = await Promise.all([
    db.collection("bookings").where("practitionerId", "==", id).limit(1).get(),
    db.collection("practitionerReviews").where("practitionerId", "==", id).limit(1).get(),
  ]);
  if (!bookings.empty || !reviews.empty) throw new PractitionerAdminError(inUse);

  // seedPractitioners() recreates a missing starter, so a starter's deletion is recorded.
  if (isStarterPractitioner(id)) {
    await db.collection(DELETED_STARTER_COLLECTION).doc(id).set({ name: snap.data()?.name ?? id, deletedAt: FieldValue.serverTimestamp() });
  }
  await db.recursiveDelete(ref);
}

/**
 * The first date, from `from` onwards, with at least one open slot — what the booking page opens
 * on. It used to open on tomorrow (skipping Sunday), which was fine while AI personas filled every
 * weekday; with only the human astrologers bookable (Monday to Friday), a customer arriving on a
 * Friday or Saturday saw every astrologer marked "Full". Null if nothing opens within `maxDays`.
 */
export async function findFirstBookableDate({ duration, practitionerId, from = new Date(), maxDays = 21 }: {
  duration: number; practitionerId?: string; from?: Date; maxDays?: number;
}): Promise<string | null> {
  const { timezone } = await getStudioSettings();
  for (let offset = 0; offset < maxDays; offset += 1) {
    const date = dateInTimeZone(new Date(from.getTime() + offset * 86_400_000), timezone);
    const { slots } = await getAvailableSlots({ date, duration, practitionerId });
    if (slots.length) return date;
  }
  return null;
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
  // Scheduled consultations are with human astrologers only. AI personas answer instant chat —
  // nothing attends a scheduled slot on their behalf — yet every seeded persona carries weekday
  // 09:30-17:30 availability rules, and the booking flow pre-selects the first slot's
  // practitioner. With 32 of 34 seeded practitioners AI-powered, the default path through /book
  // sold a paid one-to-one consultation nobody could deliver. validateAvailableSlot goes through
  // here too, so the booking API refuses them as well, not just the picker.
  const people = (practitionerId ? directory.filter((person) => person.id === practitionerId) : directory)
    .filter((person) => !person.isAiPowered);
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const dayStart = civilToUtc(date, "00:00", settings.timezone);
  const dayEnd = civilToUtc(date, "23:59", settings.timezone);

  // Read a window 12 hours wider than the requested day on both sides: a booking
  // that starts the previous evening can still be running into the morning, and a
  // slot at 00:00 would otherwise look free.
  const windowFrom = new Date(dayStart.getTime() - 12 * 3600000);
  const windowTo = new Date(dayEnd.getTime() + 12 * 3600000);
  const existingBookings: BookingForConflictCheck[] = isSupabaseCutoverActive()
    ? await getBookingsInWindowInSupabase(windowFrom, windowTo)
    : (await db.collection("bookings")
        .where("scheduledAt", ">=", windowFrom)
        .where("scheduledAt", "<", windowTo)
        .get()).docs.map((doc) => {
        const data = doc.data();
        return { id: doc.id, practitionerId: data.practitionerId ?? null, status: data.status, scheduledAt: (data.scheduledAt as FirebaseFirestore.Timestamp).toDate(), serviceDuration: data.serviceDuration };
      });

  const slots: AvailableSlot[] = [];
  for (const person of people) {
    const personBookings = existingBookings.filter((booking) => booking.id !== excludeBookingId && booking.practitionerId === person.id && booking.status !== "cancelled");
    // Collapses any pre-existing duplicate rule rows (see seedPractitioners' idempotency note) by
    // (weekday, startTime, endTime) so a practitioner whose data was affected before that fix
    // doesn't keep offering every slot twice until someone re-seeds their profile.
    const seenRuleWindows = new Set<string>();
    const rules = person.rules.filter((rule) => {
      if (rule.weekday !== weekday || !rule.active) return false;
      const key = `${rule.startTime}-${rule.endTime}`;
      if (seenRuleWindows.has(key)) return false;
      seenRuleWindows.add(key);
      return true;
    });
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
