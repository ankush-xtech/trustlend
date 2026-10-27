import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/customer", "/agent", "/staff", "/admin", "/api", "/dev", "/reset-password", "/verify-email", "/accept-invitation"],
      },
    ],
  };
}
