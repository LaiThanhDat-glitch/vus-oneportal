import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "VUS OnePortal",
    short_name: "OnePortal",
    description: "Cổng học tập VUS dành cho học viên, phụ huynh và giáo viên.",
    start_url: "/vi",
    display: "standalone",
    background_color: "#F8FAFC",
    theme_color: "#002B49",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
