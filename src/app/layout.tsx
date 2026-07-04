import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Spiderweb",
  description: "It remembers.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
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
