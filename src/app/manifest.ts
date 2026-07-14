import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Apolo Finance · Gelateria Dashboard",
    short_name: "Apolo",
    description:
      "Dashboard financer i operatiu de la gelateria: vendes, costos, horaris i rendibilitat.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f8f9fc",
    theme_color: "#f8f9fc",
    orientation: "any",
    categories: ["business", "finance", "productivity"],
    icons: [
      {
        src: "/api/pwa-icon/192",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/api/pwa-icon/512",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
