import "./globals.css";
import type { Metadata } from "next";
import { Sidebar } from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "FraudWatch — Real-Time Fraud Detection Platform",
  description:
    "Live fraud scoring, model comparison, SHAP explainability, and drift monitoring — an ML systems engineering demo.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 min-w-0 px-5 py-6 md:px-8 md:py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
