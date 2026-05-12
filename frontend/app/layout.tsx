import "./globals.css";
import type { Metadata } from "next";
import { AppSidebar } from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "FraudWatch — Real-Time Fraud Detection Platform",
  description:
    "Live fraud scoring, model comparison, SHAP explainability, and drift monitoring — an ML systems engineering demo.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        <div className="flex min-h-screen">
          <AppSidebar />
          <main className="flex-1 min-w-0 px-4 py-5 md:px-8 md:py-7">{children}</main>
        </div>
      </body>
    </html>
  );
}
