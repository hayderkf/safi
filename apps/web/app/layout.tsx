import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Safi",
  description: "منصة تقييم ومتابعة قابلة للبرمجة، معزّزة بالذكاء الاصطناعي",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
