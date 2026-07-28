import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@/styles/theme.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://spiderweb-nine.vercel.app"),
  title: "Viridescent",
  description: "It remembers.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/brand/app-icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/app-icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/brand/app-icon-180.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "Viridescent",
    description: "It remembers.",
    siteName: "Viridescent",
    images: [{ url: "/brand/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Viridescent",
    description: "It remembers.",
    images: ["/brand/og-image.png"],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          maxWidth: 640,
          margin: "0 auto",
          padding: 24,
        }}
      >
        {children}
      </body>
    </html>
  );
}
