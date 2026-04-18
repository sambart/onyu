import './globals.css';

import type { Metadata } from 'next';
import { Geist, Inter } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';

import { cn } from '@/lib/utils';

import Footer from './components/Footer';
import Header from './components/Header';
import { SidebarProvider } from './components/SidebarContext';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Discord Bot Dashboard',
  description: 'Manage your Discord server smarter',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className={cn('font-sans scroll-smooth', geist.variable)}>
      <body className={inter.className}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <SidebarProvider>
            <Header />
            <main className="min-h-screen">{children}</main>
            <Footer />
          </SidebarProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
