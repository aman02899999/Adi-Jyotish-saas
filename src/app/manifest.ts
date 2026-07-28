import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Jyotish — Vedic Astrology",
    short_name: "Jyotish",
    description: "Personal Vedic astrology, thoughtful consultations, and modern cosmic guidance.",
    start_url: "/",
    display: "standalone",
    background_color: "#eee8de",
    theme_color: "#a95838",
  };
}
