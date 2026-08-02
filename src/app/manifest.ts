import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Adi Jyotish Gurus — Vedic Astrology",
    short_name: "Adi Jyotish Gurus",
    description: "Personal Vedic astrology, thoughtful consultations, and modern cosmic guidance.",
    start_url: "/",
    display: "standalone",
    background_color: "#eee8de",
    theme_color: "#a95838",
    icons: [
      { src: "/images/logo-icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/images/logo-icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
