import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@/styles/theme.css";

export const metadata: Metadata = {
  title: "Humanbloom",
  description: "It remembers.",
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
