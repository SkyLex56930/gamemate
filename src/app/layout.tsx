import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "GameMate — Trouve tes prochains mates",
    template: "%s | GameMate",
  },
  description:
    "Trouve des joueurs compatibles, forme ta squad et télécharge GameMate gratuitement sur Windows.",
  applicationName: "GameMate",
  keywords: ["gaming", "mates", "squad", "LFG", "joueurs", "recherche de joueurs"],
  icons: {
    icon: "/gamemate-mark-transparent.png",
    apple: "/gamemate-mark-transparent.png",
  },
  openGraph: {
    title: "GameMate — Trouve tes prochains mates",
    description: "Match avec des joueurs compatibles, forme ta squad et joue sans rester solo.",
    type: "website",
    locale: "fr_FR",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#020716",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
