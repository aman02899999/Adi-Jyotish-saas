import "server-only";

import { db } from "@/db";
import { gemstoneCategories, gemstoneProductImages, gemstoneProducts, gemstoneProductVariants } from "@/db/schema";

type SeedVariant = { label: string; weightRatti: string; weightCarat: string; certificationLevel: string; price: number; compareAtPrice?: number; stockQuantity: number; sku: string };
type SeedProduct = {
  categorySlug: string;
  name: string; slug: string; sku: string;
  shortDescription: string; description: string; benefits: string; whoShouldWear: string;
  recommendedZodiac: string; recommendedPlanets: string; origin: string; color: string; treatment: string; certification: string;
  image: string;
  featured?: boolean; trending?: boolean; bestseller?: boolean;
  variants: SeedVariant[];
};

const categories = [
  { name: "Ruby", slug: "ruby", description: "Manik — the gem of the Sun, worn for confidence, leadership, and vitality.", imageUrl: "/images/gemstones/ruby.jpg", sortOrder: 1 },
  { name: "Emerald", slug: "emerald", description: "Panna — the gem of Mercury, worn for clarity, communication, and intellect.", imageUrl: "/images/gemstones/emerald.jpg", sortOrder: 2 },
  { name: "Blue Sapphire", slug: "blue-sapphire", description: "Neelam — the gem of Saturn, worn for discipline, focus, and fast results.", imageUrl: "/images/gemstones/blue-sapphire.jpg", sortOrder: 3 },
  { name: "Yellow Sapphire", slug: "yellow-sapphire", description: "Pukhraj — the gem of Jupiter, worn for wisdom, wealth, and marriage prospects.", imageUrl: "/images/gemstones/yellow-sapphire.jpg", sortOrder: 4 },
  { name: "Pearl", slug: "pearl", description: "Moti — the gem of the Moon, worn for calm, emotional balance, and intuition.", imageUrl: "/images/gemstones/pearl.jpg", sortOrder: 5 },
  { name: "Coral", slug: "coral", description: "Moonga — the gem of Mars, worn for courage, energy, and decisiveness.", imageUrl: "/images/gemstones/coral.jpg", sortOrder: 6 },
  { name: "Cat's Eye", slug: "cats-eye", description: "Lehsunia — the gem of Ketu, worn for protection and sudden reversals of fortune.", imageUrl: "/images/gemstones/cats-eye.jpg", sortOrder: 7 },
  { name: "Hessonite", slug: "hessonite", description: "Gomed — the gem of Rahu, worn for grounding and cutting through confusion.", imageUrl: "/images/gemstones/hessonite.jpg", sortOrder: 8 },
  { name: "Rudraksha", slug: "rudraksha", description: "Sacred beads worn for spiritual protection and meditation practice.", imageUrl: "/images/gemstones/rudraksha.jpg", sortOrder: 9 },
  { name: "Bracelets", slug: "bracelets", description: "Beaded gemstone bracelets for everyday wear.", imageUrl: "/images/gemstones/bracelet.jpg", sortOrder: 10 },
];

const products: SeedProduct[] = [
  {
    categorySlug: "ruby", name: "Natural Burmese Ruby (Manik)", slug: "natural-burmese-ruby-manik", sku: "RB-001",
    shortDescription: "Deep pigeon-blood red ruby, unheated and lab certified.",
    description: "This natural Burmese ruby carries the classic pigeon-blood red hue prized in Vedic astrology. Untreated and lab certified, it is cut to maximize brilliance while preserving carat weight for astrological potency.",
    benefits: "Strengthens the Sun in your chart — boosts confidence, leadership, vitality, and recognition in career.",
    whoShouldWear: "Those with a weak or afflicted Sun, or seeking authority, government favor, or better health and stamina.",
    recommendedZodiac: "Leo, Aries", recommendedPlanets: "Sun",
    origin: "Mogok, Myanmar", color: "Pigeon-blood red", treatment: "Natural / Unheated", certification: "GRS Certified",
    image: "/images/gemstones/ruby.jpg", featured: true, bestseller: true,
    variants: [
      { label: "3.25 Ratti", weightRatti: "3.25", weightCarat: "2.95", certificationLevel: "GRS Certified", price: 18500, compareAtPrice: 22000, stockQuantity: 6, sku: "RB-001-3R" },
      { label: "5.5 Ratti", weightRatti: "5.5", weightCarat: "5.0", certificationLevel: "GRS Certified", price: 34900, compareAtPrice: 41000, stockQuantity: 3, sku: "RB-001-5R" },
    ],
  },
  {
    categorySlug: "emerald", name: "Natural Zambian Emerald (Panna)", slug: "natural-zambian-emerald-panna", sku: "EM-001",
    shortDescription: "Vivid green emerald with classic garden inclusions, lab certified.",
    description: "A rich, vivid green Zambian emerald with the natural garden inclusions expected of an untreated stone. Emerald-cut to highlight its saturated color and astrological clarity.",
    benefits: "Strengthens Mercury — sharpens communication, analytical thinking, business acumen, and academic performance.",
    whoShouldWear: "Students, writers, communicators, and business professionals seeking mental clarity and quick decision-making.",
    recommendedZodiac: "Gemini, Virgo", recommendedPlanets: "Mercury",
    origin: "Kagem, Zambia", color: "Vivid green", treatment: "Minor oiling (traditional)", certification: "IGI Certified",
    image: "/images/gemstones/emerald.jpg", featured: true,
    variants: [
      { label: "4 Ratti", weightRatti: "4.0", weightCarat: "3.64", certificationLevel: "IGI Certified", price: 14200, compareAtPrice: 16800, stockQuantity: 8, sku: "EM-001-4R" },
      { label: "6 Ratti", weightRatti: "6.0", weightCarat: "5.45", certificationLevel: "IGI Certified", price: 24600, stockQuantity: 4, sku: "EM-001-6R" },
    ],
  },
  {
    categorySlug: "blue-sapphire", name: "Natural Ceylon Blue Sapphire (Neelam)", slug: "natural-ceylon-blue-sapphire-neelam", sku: "BS-001",
    shortDescription: "Cornflower blue Ceylon sapphire, fast-acting and powerful.",
    description: "A cornflower blue Ceylon sapphire known for being the fastest-acting and most powerful gemstone in Vedic astrology. Cushion-cut and lab certified as natural and unheated.",
    benefits: "Strengthens Saturn — brings discipline, focus, career stability, and removes obstacles when it suits your chart.",
    whoShouldWear: "Those undergoing a Saturn dasha or seeking career stability — always recommended with a short trial period first.",
    recommendedZodiac: "Capricorn, Aquarius", recommendedPlanets: "Saturn",
    origin: "Ratnapura, Sri Lanka", color: "Cornflower blue", treatment: "Natural / Unheated", certification: "GRS Certified",
    image: "/images/gemstones/blue-sapphire.jpg", trending: true, bestseller: true,
    variants: [
      { label: "3 Ratti", weightRatti: "3.0", weightCarat: "2.73", certificationLevel: "GRS Certified", price: 21500, compareAtPrice: 25000, stockQuantity: 5, sku: "BS-001-3R" },
      { label: "5 Ratti", weightRatti: "5.0", weightCarat: "4.55", certificationLevel: "GRS Certified", price: 38900, stockQuantity: 2, sku: "BS-001-5R" },
    ],
  },
  {
    categorySlug: "yellow-sapphire", name: "Natural Ceylon Yellow Sapphire (Pukhraj)", slug: "natural-ceylon-yellow-sapphire-pukhraj", sku: "YS-001",
    shortDescription: "Golden yellow Ceylon sapphire for Jupiter's blessings.",
    description: "A radiant golden-yellow Ceylon sapphire, round brilliant cut for maximum sparkle. One of the most auspicious stones in Vedic astrology, worn for Jupiter's benefic influence.",
    benefits: "Strengthens Jupiter — attracts wisdom, wealth, marriage prospects, and general good fortune.",
    whoShouldWear: "Those seeking marriage, higher education, financial growth, or a stronger connection to teachers and mentors.",
    recommendedZodiac: "Sagittarius, Pisces", recommendedPlanets: "Jupiter",
    origin: "Ratnapura, Sri Lanka", color: "Golden yellow", treatment: "Natural / Unheated", certification: "GRS Certified",
    image: "/images/gemstones/yellow-sapphire.jpg", featured: true, trending: true,
    variants: [
      { label: "4 Ratti", weightRatti: "4.0", weightCarat: "3.64", certificationLevel: "GRS Certified", price: 16800, stockQuantity: 7, sku: "YS-001-4R" },
      { label: "6.25 Ratti", weightRatti: "6.25", weightCarat: "5.68", certificationLevel: "GRS Certified", price: 28400, compareAtPrice: 32000, stockQuantity: 3, sku: "YS-001-6R" },
    ],
  },
  {
    categorySlug: "pearl", name: "Natural South Sea Pearl (Moti)", slug: "natural-south-sea-pearl-moti", sku: "PL-001",
    shortDescription: "Lustrous natural pearl for calm and emotional balance.",
    description: "A smooth, high-luster natural South Sea pearl selected for its round shape and even color. Worn to soothe the mind and strengthen intuition through the Moon's influence.",
    benefits: "Strengthens the Moon — calms the mind, improves sleep, emotional balance, and intuitive clarity.",
    whoShouldWear: "Those experiencing anxiety, emotional instability, or a weak Moon placement in their birth chart.",
    recommendedZodiac: "Cancer", recommendedPlanets: "Moon",
    origin: "South Sea", color: "Cream white", treatment: "Natural, undyed", certification: "IGI Certified",
    image: "/images/gemstones/pearl.jpg", bestseller: true,
    variants: [
      { label: "6 Ratti", weightRatti: "6.0", weightCarat: "5.45", certificationLevel: "IGI Certified", price: 3200, stockQuantity: 20, sku: "PL-001-6R" },
      { label: "9 Ratti", weightRatti: "9.0", weightCarat: "8.18", certificationLevel: "IGI Certified", price: 5600, compareAtPrice: 6500, stockQuantity: 12, sku: "PL-001-9R" },
    ],
  },
  {
    categorySlug: "coral", name: "Natural Italian Red Coral (Moonga)", slug: "natural-italian-red-coral-moonga", sku: "CR-001",
    shortDescription: "Deep red untreated coral for courage and vitality.",
    description: "A deep red, untreated coral branch piece polished into a smooth cabochon. Worn to invoke Mars' courage, energy, and decisiveness in Vedic tradition.",
    benefits: "Strengthens Mars — builds courage, physical energy, decisiveness, and protection from conflict.",
    whoShouldWear: "Those in competitive fields, sports, defense, or seeking more assertiveness and physical stamina.",
    recommendedZodiac: "Aries, Scorpio", recommendedPlanets: "Mars",
    origin: "Italy (Mediterranean)", color: "Deep red", treatment: "Natural, polished", certification: "IGI Certified",
    image: "/images/gemstones/coral.jpg",
    variants: [
      { label: "7 Ratti", weightRatti: "7.0", weightCarat: "6.36", certificationLevel: "IGI Certified", price: 4800, stockQuantity: 15, sku: "CR-001-7R" },
      { label: "10 Ratti", weightRatti: "10.0", weightCarat: "9.09", certificationLevel: "IGI Certified", price: 7200, stockQuantity: 9, sku: "CR-001-10R" },
    ],
  },
  {
    categorySlug: "cats-eye", name: "Natural Chrysoberyl Cat's Eye (Lehsunia)", slug: "natural-chrysoberyl-cats-eye-lehsunia", sku: "CE-001",
    shortDescription: "Sharp chatoyant cat's eye with a razor-sharp light band.",
    description: "A honey-golden chrysoberyl cat's eye cabochon with a sharp, centered chatoyant band. Worn to pacify Ketu's unpredictable influence and offer protection.",
    benefits: "Strengthens Ketu — offers protection from sudden loss, accidents, and hidden enemies; supports spiritual insight.",
    whoShouldWear: "Those going through a Ketu dasha, experiencing unexplained setbacks, or seeking spiritual protection.",
    recommendedZodiac: "Sagittarius, Scorpio", recommendedPlanets: "Ketu",
    origin: "Kandy, Sri Lanka", color: "Honey golden", treatment: "Natural, cabochon cut", certification: "GRS Certified",
    image: "/images/gemstones/cats-eye.jpg",
    variants: [
      { label: "3.5 Ratti", weightRatti: "3.5", weightCarat: "3.18", certificationLevel: "GRS Certified", price: 9800, stockQuantity: 10, sku: "CE-001-3R" },
      { label: "5 Ratti", weightRatti: "5.0", weightCarat: "4.55", certificationLevel: "GRS Certified", price: 15400, compareAtPrice: 18000, stockQuantity: 5, sku: "CE-001-5R" },
    ],
  },
  {
    categorySlug: "hessonite", name: "Natural Ceylon Hessonite (Gomed)", slug: "natural-ceylon-hessonite-gomed", sku: "HS-001",
    shortDescription: "Honey-brown hessonite for grounding Rahu's influence.",
    description: "A classic honey-brown Ceylon hessonite garnet, pear-cut for elegant wear. One of the most recommended stones for pacifying Rahu in Vedic astrology.",
    benefits: "Strengthens Rahu — cuts through confusion, supports foreign opportunities, and grounds erratic ambition.",
    whoShouldWear: "Those with an afflicted Rahu, facing sudden confusion, or working in foreign lands or unconventional careers.",
    recommendedZodiac: "Virgo, Gemini", recommendedPlanets: "Rahu",
    origin: "Ratnapura, Sri Lanka", color: "Honey brown", treatment: "Natural, unheated", certification: "IGI Certified",
    image: "/images/gemstones/hessonite.jpg",
    variants: [
      { label: "6 Ratti", weightRatti: "6.0", weightCarat: "5.45", certificationLevel: "IGI Certified", price: 6400, stockQuantity: 14, sku: "HS-001-6R" },
      { label: "9 Ratti", weightRatti: "9.0", weightCarat: "8.18", certificationLevel: "IGI Certified", price: 10200, stockQuantity: 6, sku: "HS-001-9R" },
    ],
  },
  {
    categorySlug: "rudraksha", name: "5 Mukhi Nepali Rudraksha Bead", slug: "5-mukhi-nepali-rudraksha-bead", sku: "RD-001",
    shortDescription: "Authentic 5-faced Rudraksha bead from Nepal for daily wear.",
    description: "A genuine 5 Mukhi (five-faced) Rudraksha bead sourced from Nepal, energized and ready to wear. Associated with Lord Shiva and worn for spiritual grounding.",
    benefits: "Supports meditation, emotional stability, and general well-being; considered auspicious for all wearers.",
    whoShouldWear: "Suitable for anyone seeking spiritual grounding, stress relief, or a steady daily meditation practice.",
    recommendedZodiac: "All signs", recommendedPlanets: "Jupiter",
    origin: "Nepal", color: "Natural brown", treatment: "Natural, energized", certification: "Lab tested authentic",
    image: "/images/gemstones/rudraksha.jpg", bestseller: true,
    variants: [
      { label: "Single bead", weightRatti: "—", weightCarat: "—", certificationLevel: "Lab tested", price: 899, stockQuantity: 40, sku: "RD-001-1PC" },
      { label: "Mala (108 beads)", weightRatti: "—", weightCarat: "—", certificationLevel: "Lab tested", price: 4200, compareAtPrice: 5000, stockQuantity: 10, sku: "RD-001-MALA" },
    ],
  },
  {
    categorySlug: "bracelets", name: "Red Coral Beaded Bracelet", slug: "red-coral-beaded-bracelet", sku: "BR-001",
    shortDescription: "Polished red coral bead bracelet, adjustable fit.",
    description: "A handcrafted bracelet of polished natural red coral beads, strung on a durable elastic cord for a comfortable, adjustable fit. An easy daily-wear way to invoke Mars' energy.",
    benefits: "A gentle, everyday way to carry Mars' courage and energy without a large centre stone.",
    whoShouldWear: "Anyone wanting the benefits of coral in an easy, everyday accessory rather than a ring or pendant.",
    recommendedZodiac: "Aries, Scorpio", recommendedPlanets: "Mars",
    origin: "Italy (Mediterranean)", color: "Deep red", treatment: "Natural, polished beads", certification: "Studio verified",
    image: "/images/gemstones/bracelet.jpg", trending: true,
    variants: [
      { label: "8mm beads", weightRatti: "—", weightCarat: "—", certificationLevel: "Studio verified", price: 1450, stockQuantity: 25, sku: "BR-001-8MM" },
      { label: "10mm beads", weightRatti: "—", weightCarat: "—", certificationLevel: "Studio verified", price: 1890, stockQuantity: 18, sku: "BR-001-10MM" },
    ],
  },
];

export async function seedGemstoneCatalog() {
  await db.insert(gemstoneCategories).values(categories).onConflictDoNothing({ target: gemstoneCategories.slug });

  const categoryRows = await db.select().from(gemstoneCategories);
  const categoryIdBySlug = new Map(categoryRows.map((row) => [row.slug, row.id]));

  for (const product of products) {
    const categoryId = categoryIdBySlug.get(product.categorySlug);
    if (!categoryId) continue;

    const [created] = await db.insert(gemstoneProducts).values({
      categoryId,
      name: product.name,
      slug: product.slug,
      shortDescription: product.shortDescription,
      description: product.description,
      benefits: product.benefits,
      whoShouldWear: product.whoShouldWear,
      recommendedZodiac: product.recommendedZodiac,
      recommendedPlanets: product.recommendedPlanets,
      origin: product.origin,
      color: product.color,
      treatment: product.treatment,
      certification: product.certification,
      sku: product.sku,
      featured: product.featured ?? false,
      trending: product.trending ?? false,
      bestseller: product.bestseller ?? false,
      active: true,
      metaTitle: `${product.name} | Buy Gemstones`,
      metaDescription: product.shortDescription,
    }).onConflictDoNothing({ target: gemstoneProducts.slug }).returning();

    if (!created) continue;

    await db.insert(gemstoneProductImages).values({ productId: created.id, url: product.image, alt: product.name, sortOrder: 0, isPrimary: true }).onConflictDoNothing();
    await db.insert(gemstoneProductVariants).values(product.variants.map((variant) => ({
      productId: created.id,
      label: variant.label,
      weightCarat: variant.weightCarat,
      weightRatti: variant.weightRatti,
      certificationLevel: variant.certificationLevel,
      price: variant.price,
      compareAtPrice: variant.compareAtPrice ?? null,
      stockQuantity: variant.stockQuantity,
      sku: variant.sku,
      active: true,
    }))).onConflictDoNothing({ target: gemstoneProductVariants.sku });
  }
}
