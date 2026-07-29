export type BlogPost = {
  slug: string;
  title: string;
  excerpt: string;
  cover: string;
  category: string;
  author: string;
  readMinutes: number;
  publishedAt: string;
  body: { heading?: string; paragraphs: string[] }[];
};

export const blogPosts: BlogPost[] = [
  {
    slug: "understanding-your-moon-sign",
    title: "Understanding your Moon sign: the emotional blueprint of your chart",
    excerpt: "Your Sun sign is who you're becoming. Your Moon sign is who you already are underneath it — the part of your chart that governs instinct, comfort, and how you actually feel.",
    cover: "/images/blog/blog-moon-signs.jpg",
    category: "Foundations",
    author: "Jyotish Studio",
    readMinutes: 6,
    publishedAt: "2026-06-02",
    body: [
      {
        paragraphs: [
          "Most people who look up their astrology know their Sun sign. Far fewer know their Moon sign — and in Vedic astrology, that's the bigger oversight. Where the Sun describes your identity and direction, the Moon (Chandra) describes your emotional temperament: what makes you feel safe, what unsettles you, and how you process the world before you've had a chance to think about it.",
          "In fact, Jyotish traditionally places more emphasis on the Moon than the Sun for exactly this reason. Your Moon sign, or Rashi, is calculated from the exact position of the Moon at your birth — which is why it depends so heavily on accurate birth time. A few hours can shift it into an entirely different sign.",
        ],
      },
      {
        heading: "Why the Moon matters more than you'd think",
        paragraphs: [
          "The Moon moves faster than any other planet, passing through a new sign roughly every two and a half days. That sensitivity to timing is part of what makes it so personal — it captures a much narrower slice of the sky than your Sun sign does, which is why two people born on the same day can have completely different emotional wiring.",
          "A well-placed Moon tends to show up as steadiness: the ability to stay grounded during stress, to read a room accurately, to know what you need without overthinking it. A challenged Moon can look like restlessness, difficulty settling, or feeling responses that seem disproportionate to what's actually happening — not a flaw, just a chart pointing you toward where self-awareness pays off.",
        ],
      },
      {
        heading: "How a practitioner actually reads it",
        paragraphs: [
          "A Vedic astrologer doesn't just look at which sign your Moon sits in — they look at its house placement, the planets aspecting it, and its relationship to your Ascendant. That combination is what turns 'Moon in Cancer' from a generic trait list into something specific to you: how you handle conflict, what kind of home environment you thrive in, even how you tend to process grief.",
          "This is also why an authentic reading needs your exact birth time, not just your birth date. A Moon near the edge of a sign can fall on either side of that boundary depending on whether you were born at 11:50pm or 12:10am — which is the single most common reason two 'free' online charts disagree with each other.",
        ],
      },
      {
        heading: "Where to go from here",
        paragraphs: [
          "If you've never had your Moon sign properly read, it's one of the most immediately useful places to start — it tends to explain patterns people have quietly noticed about themselves for years without having language for them. A Birth Chart Reading is the natural next step: it places your Moon in the full context of your chart rather than looking at it in isolation.",
        ],
      },
    ],
  },
  {
    slug: "saturn-return-your-late-twenties",
    title: "Saturn return: why your late-20s feel like a cosmic reset",
    excerpt: "Saturn takes roughly 29.5 years to complete one orbit — which means almost everyone hits a Saturn return around age 27-30. Here's what Vedic astrology says is actually happening.",
    cover: "/images/blog/blog-saturn-return.jpg",
    category: "Transits",
    author: "Jyotish Studio",
    readMinutes: 7,
    publishedAt: "2026-06-14",
    body: [
      {
        paragraphs: [
          "If you're in your late twenties and everything suddenly feels like it's being renegotiated — career, relationships, where you live, who you are — you're not imagining it. Saturn (Shani) takes about 29.5 years to return to the exact position it occupied when you were born. That return is one of the most consistently significant transits in Vedic astrology, and it lands on almost everyone at roughly the same age.",
          "Shani is the planet of discipline, structure, time, and consequence. It doesn't reward shortcuts. What it does reward is the slow, unglamorous work of building something real — which is exactly why its return so often coincides with people finally confronting the parts of their life that were built on convenience rather than substance.",
        ],
      },
      {
        heading: "What actually happens during a Saturn return",
        paragraphs: [
          "It rarely arrives as one dramatic event. More often it's a period — usually spanning two to three years — where things that weren't structurally sound start to feel unsustainable. A job that never fit. A relationship built on timing rather than compatibility. Habits that worked at 22 and quietly stopped working.",
          "The house Saturn occupies in your chart, and the houses it rules for you specifically, determine which part of life gets this treatment. For some people it's career. For others it's deeply personal — family responsibility, health discipline, or reckoning with long-postponed decisions.",
        ],
      },
      {
        heading: "Why it isn't something to fear",
        paragraphs: [
          "Saturn has a reputation as the 'hard' planet in Jyotish, but that reputation misses the point. Saturn isn't punishing you — it's asking you to build on rock instead of sand, and it will keep testing the foundation until you do. People who work with their Saturn return instead of resisting it tend to describe the years afterward as the most stable of their adult life.",
          "A consultation during this window is less about predicting what will happen and more about understanding what's actually being asked of you — which decisions are worth the discomfort of making now, rather than later on Saturn's much less forgiving terms.",
        ],
      },
    ],
  },
  {
    slug: "the-art-of-muhurat",
    title: "The art of Muhurat: choosing auspicious timing the Vedic way",
    excerpt: "Vedic astrology treats timing as something you can actively work with — not just observe. Muhurat is the practice of finding windows when the sky itself supports what you're trying to do.",
    cover: "/images/blog/blog-muhurat-timing.jpg",
    category: "Practice",
    author: "Jyotish Studio",
    readMinutes: 5,
    publishedAt: "2026-06-21",
    body: [
      {
        paragraphs: [
          "In most Western thinking, timing is something that happens to you. In Vedic astrology, it's something you can work with. Muhurat — the selection of an auspicious moment for an important action — is one of the oldest continuously practiced branches of Jyotish, still used today for weddings, business launches, moving house, and the start of new ventures.",
          "The underlying idea is straightforward: the planetary configuration at the moment you begin something leaves an imprint on how that thing unfolds. A well-chosen Muhurat doesn't guarantee success, but it removes friction — it's the difference between starting with the current or against it.",
        ],
      },
      {
        heading: "What goes into choosing one",
        paragraphs: [
          "A proper Muhurat calculation weighs several layered factors: the weekday and its ruling planet, the lunar day (Tithi), the position of the Moon among the 27 Nakshatras, and the avoidance of specific inauspicious windows like Rahu Kaal. For significant events, a practitioner will also check the timing against your personal birth chart, since a date that's generally auspicious can still clash with your individual planetary placements.",
          "This is precisely why Muhurat isn't something you can reliably get from a generic app or panchang printout — the general calendar tells you what's broadly favorable for anyone; a personal consultation tells you what's favorable for you.",
        ],
      },
      {
        heading: "Where it's used today",
        paragraphs: [
          "Weddings remain the most well-known use, but the same logic applies to signing a lease, registering a company, a first day at a new job, or even a difficult conversation you've been putting off. Clients often come in already having chosen the 'what' — they're looking for the 'when' that gives it the best possible start.",
          "A Panchang Consultation is built for exactly this: bring the date range you're working with, and a practitioner narrows it to the windows that actually support you.",
        ],
      },
    ],
  },
  {
    slug: "vimshottari-dasha-explained",
    title: "Vimshottari Dasha explained: reading the timeline of your life",
    excerpt: "If your birth chart is a map, Dasha is the itinerary. It's the system Vedic astrologers use to answer the question every client eventually asks: not just what, but when.",
    cover: "/images/blog/blog-dashas-explained.jpg",
    category: "Foundations",
    author: "Jyotish Studio",
    readMinutes: 8,
    publishedAt: "2026-07-03",
    body: [
      {
        paragraphs: [
          "A birth chart on its own is static — it describes the sky at the moment you were born and stays that way forever. What gives Vedic astrology its sense of narrative, of things unfolding in a particular order, is the Dasha system: a sequence of planetary periods that governs which planet's themes are 'active' at any given point in your life.",
          "The most widely used version is Vimshottari Dasha, a 120-year cycle divided among the nine grahas, each ruling a period of different length — the Moon's period lasts 10 years, Saturn's lasts 19, Venus's lasts 20, and so on. Where your Moon sat in its Nakshatra at birth determines which planet's period you started life in, and everything unfolds from there.",
        ],
      },
      {
        heading: "Why the same chart can feel different at different ages",
        paragraphs: [
          "This is the piece that resolves a common confusion: two people can have similar charts and completely different lives at the same age, because they're moving through different Dashas. It's also why a good astrologer doesn't just read your chart once and stop — they read it against wherever you currently sit in your Dasha sequence.",
          "Each major period (Mahadasha) is further divided into sub-periods (Antardasha) ruled by other planets, which is what allows for the finer-grained texture of 'this is a good two years for partnership, even within a broadly career-focused decade.'",
        ],
      },
      {
        heading: "What this looks like in a real reading",
        paragraphs: [
          "In practice, a practitioner will identify your current Mahadasha and Antardasha, then look at how those ruling planets are placed in your natal chart — strong, weak, well-aspected, afflicted — to describe what that period tends to bring out. Someone in a Jupiter Mahadasha with Jupiter well-placed often experiences a genuine period of growth and opportunity; the same Jupiter period with Jupiter afflicted can feel more like a test of patience before that growth arrives.",
          "This is the mechanism behind most serious Vedic predictions about timing — not a vague sense that 'change is coming,' but a specific planetary period with a specific character, mapped against your specific chart.",
        ],
      },
    ],
  },
  {
    slug: "beyond-sun-signs-compatibility",
    title: "Beyond Sun signs: how Vedic astrology reads relationship compatibility",
    excerpt: "Guna Milan, the traditional Vedic compatibility system, checks 36 points across eight distinct categories — a far more granular approach than comparing two Sun signs.",
    cover: "/images/blog/blog-compatibility.jpg",
    category: "Relationships",
    author: "Jyotish Studio",
    readMinutes: 6,
    publishedAt: "2026-07-11",
    body: [
      {
        paragraphs: [
          "Pop astrology tends to reduce compatibility to two Sun signs and a chart of who gets along with whom. Vedic astrology takes a considerably more layered approach, built around a system called Guna Milan, or Ashtakoota — literally, 'eight-fold matching.'",
          "The system compares the Moon sign and Nakshatra of two people across eight categories, each weighted with a maximum point value, totaling 36 points. It was traditionally used to assess marriage compatibility, but the same underlying logic — comparing emotional temperament, mutual attraction, and life-path alignment — applies just as usefully to any serious partnership today.",
        ],
      },
      {
        heading: "What the eight categories actually measure",
        paragraphs: [
          "Without getting into the full technical breakdown, the categories move from the very instinctive (mental compatibility, physical attraction) toward the more structural (shared temperament, health and vitality between partners, and — the highest-weighted category — mutual growth and the avoidance of Nadi dosha, a marker for genetic and health compatibility).",
          "A score isn't a verdict. Couples with modest Guna Milan scores build strong relationships constantly — what the reading actually offers is a map of where the natural ease is and where the relationship will need more conscious effort. That's a very different, more useful piece of information than a binary compatible-or-not answer.",
        ],
      },
      {
        heading: "Why this needs an actual practitioner",
        paragraphs: [
          "Automated compatibility calculators can produce a numeric score, but they can't do what a practitioner does next: read both charts together, look at how each person's Venus and Mars interact, check the 7th house (partnership) in both charts, and explain what the numbers mean in the context of two specific people rather than as an abstract score out of 36.",
          "A Relationship Synastry reading is built for exactly this — bringing both birth details in for a joint reading rather than two separate ones.",
        ],
      },
    ],
  },
  {
    slug: "retrograde-season-without-panic",
    title: "Retrograde season: what Vedic astrology actually says (no panic required)",
    excerpt: "\"Mercury retrograde\" has become internet shorthand for chaos. Vedic astrology treats retrogrades with far more nuance — and in some cases, as genuinely favorable.",
    cover: "/images/blog/blog-retrogrades.jpg",
    category: "Transits",
    author: "Jyotish Studio",
    readMinutes: 5,
    publishedAt: "2026-07-19",
    body: [
      {
        paragraphs: [
          "Every few months, some corner of the internet declares that Mercury is retrograde and that you should postpone anything important. It's become a cultural shorthand for expecting delays and miscommunication. Vedic astrology's actual treatment of retrograde planets — Vakri, in Sanskrit — is considerably more nuanced, and occasionally the opposite of the popular narrative.",
          "A planet is 'retrograde' when, from Earth's vantage point, it appears to move backward through the zodiac. It isn't actually reversing direction; it's an optical effect of orbital speed. But in Jyotish, that apparent reversal is read as a shift in a planet's expression — often turning its energy inward rather than removing it.",
        ],
      },
      {
        heading: "It depends entirely on which planet",
        paragraphs: [
          "This is where the popular narrative oversimplifies things. A retrograde Mercury does tend to favor revisiting, reviewing, and reconnecting over launching something brand new — which is genuinely useful information, not just superstition. But a retrograde Jupiter or Venus is treated very differently in classical Jyotish; some traditions consider a retrograde benefic planet to be strengthened, not weakened, because its energy is directed more intensely rather than dispersed outward.",
          "Saturn retrograde, similarly, is often read as an opportunity to correct course on long-term structures rather than purely as an obstacle. The specific planet, and its placement in your personal chart, matters far more than a blanket rule.",
        ],
      },
      {
        heading: "A more useful way to think about it",
        paragraphs: [
          "Rather than treating every retrograde as a reason to freeze, a Vedic approach asks a more specific question: which planet is retrograde, what does it govern in your particular chart, and does that suggest a period better suited to revision than to launch. Sometimes the answer really is 'wait.' Just as often, it's 'this is a good window for the kind of work you've been putting off.'",
          "If you're navigating a big decision during a retrograde and want to know which read applies to you, that's exactly the kind of question a Daily Horoscope or full consultation can answer with your actual chart in hand, rather than a one-size-fits-all warning.",
        ],
      },
    ],
  },
];

export function getAllPosts() {
  return [...blogPosts].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
}

export function getPostBySlug(slug: string) {
  return blogPosts.find((post) => post.slug === slug) ?? null;
}
