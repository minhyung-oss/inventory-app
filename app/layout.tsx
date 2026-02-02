import "./globals.css";

export const metadata = {
  title: "재고 조회 시스템",
  description: "조회 전용 재고 조회/견적 시스템",
  openGraph: {
    title: "재고 조회 시스템",
    description: "조회 전용 재고 조회/견적 시스템",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
      },
    ],
    type: "website",
    locale: "ko_KR",
  },
  twitter: {
    card: "summary_large_image",
    title: "재고 조회 시스템",
    description: "조회 전용 재고 조회/견적 시스템",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
