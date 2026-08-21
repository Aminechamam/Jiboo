import type { MetadataRoute } from "next";
import { fetchProducts } from "@/lib/supabase";

const SITE_URL = "https://jiboo.tn";

// Force this route to run at REQUEST time, not at `next build` time. This
// project's Supabase client (lib/supabase.ts) can only be called somewhere
// that actually has network access at the moment it runs — the local build
// sandbox does not, but a live server/serverless request on Vercel does.
// force-dynamic sidesteps the build-time fetch entirely.
export const dynamic = "force-dynamic";

// Next.js serves this automatically at /sitemap.xml.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${SITE_URL}/catalogue`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/conditions-generales`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.3,
    },
  ];

  let productRoutes: MetadataRoute.Sitemap = [];
  try {
    const products = await fetchProducts();
    productRoutes = products.map((product) => ({
      url: `${SITE_URL}/produit/${product.id}`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    }));
  } catch {
    // If Supabase is briefly unreachable during build, ship the static
    // routes rather than failing the whole sitemap/build.
  }

  return [...staticRoutes, ...productRoutes];
}
