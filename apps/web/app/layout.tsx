import './globals.css';

import type { Metadata } from 'next';
import { Geist, Inter } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';

import { ToastProvider } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

import Footer from './components/Footer';
import Header from './components/Header';
import { SidebarProvider } from './components/SidebarContext';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    default: 'Onyu · 디스코드 음성 채널 봇',
    template: '%s · Onyu',
  },
  description:
    '디스코드 음성 채널 활동을 추적하고 Gemini AI로 분석하는 봇 — 음성 통계 · 자동 채널 · 신규 멤버 관리를 한 봇으로',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className={cn('font-sans scroll-smooth', geist.variable)}>
      <body className={inter.className}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ToastProvider>
            <SidebarProvider>
              <Header />
              <main className="min-h-screen">{children}</main>
              <Footer />
            </SidebarProvider>
          </ToastProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
