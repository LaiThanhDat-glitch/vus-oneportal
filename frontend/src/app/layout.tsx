import type { Metadata, Viewport } from "next";
import { ServiceWorker } from "@/components/ServiceWorker";
import "./globals.css";

export const metadata: Metadata = {
  title: "VUS OnePortal",
  description: "Cổng học tập kết nối học viên, phụ huynh và đội ngũ VUS.",
  applicationName: "VUS OnePortal",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "OnePortal", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#002B49",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body>{children}<ServiceWorker /></body>
    </html>
  );
}
