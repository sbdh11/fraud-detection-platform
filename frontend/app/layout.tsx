import "./globals.css";
import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { AppSidebar } from "@/components/Sidebar";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "FraudWatch · Real-Time Fraud Detection Platform",
  description:
    "Live fraud scoring, model comparison, SHAP explainability, and drift monitoring; an ML systems engineering project.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body className="font-sans">
        <div className="flex min-h-screen">
          <AppSidebar />
          <main className="flex-1 min-w-0 px-4 py-5 md:px-7 md:py-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
