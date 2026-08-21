import type { MetadataRoute } from "next";

const SITE_URL = "https://jiboo.tn";

// Served automatically at /robots.txt.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/commande"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
