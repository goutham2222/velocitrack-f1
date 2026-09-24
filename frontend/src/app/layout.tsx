import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VelociTrack F1 | 3D/2D Formula 1 Race Replay Engine",
  description:
    "Production-grade interactive 3D/2D Formula 1 Race Replay and Telemetry Engine powered by FastF1 and Three.js.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0b0e14",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark h-full" suppressHydrationWarning>
      <body className="h-full bg-titanium-950 text-slate-100 antialiased overflow-hidden select-none">
        {children}
      </body>
    </html>
  );
}
