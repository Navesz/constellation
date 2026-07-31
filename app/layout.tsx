import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const title = "Constellation — GitHub Profile Observatory";
const description =
  "Mapeie conquistas, marcos e sinais públicos de um perfil do GitHub sem gamificação artificial.";

export async function generateMetadata(): Promise<Metadata> {
  const incomingHeaders = await headers();
  const host = incomingHeaders.get("x-forwarded-host") ?? incomingHeaders.get("host") ?? "localhost:3000";
  const protocol = incomingHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const socialImage = `${protocol}://${host}/og.png`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: socialImage, width: 1732, height: 909, alt: "Constellation profile observatory" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [socialImage],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
