import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: "Let's make plans! - 친구들과 초간편 약속 잡기",
  description: '카톡 무한 핑퐁 없이, 모바일 캘린더 터치 몇 번으로 모두가 가능한 공통 약속일을 찾아보세요.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-slate-50 flex justify-center antialiased">
        {/* Mobile viewport constraint: max-w-md on desktop for realistic mobile app view */}
        <main className="w-full max-w-md min-h-screen bg-white shadow-2xl flex flex-col relative border-x border-slate-100">
          {children}
        </main>
      </body>
    </html>
  );
}

