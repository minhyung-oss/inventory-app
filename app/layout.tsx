import "./globals.css";

export const metadata = {
  title: "재고 조회 시스템",
  description: "조회 전용 재고 조회/견적 시스템",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
