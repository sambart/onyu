import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

// 정적 import (Turbopack 호환 — 동적 경로 변수 resolve 불가)
import enAdmin from '../../../libs/i18n/locales/en/web/admin.json';
import enAuth from '../../../libs/i18n/locales/en/web/auth.json';
import enCommon from '../../../libs/i18n/locales/en/web/common.json';
import enDashboard from '../../../libs/i18n/locales/en/web/dashboard.json';
import enLanding from '../../../libs/i18n/locales/en/web/landing.json';
import enSettings from '../../../libs/i18n/locales/en/web/settings.json';
import koAdmin from '../../../libs/i18n/locales/ko/web/admin.json';
import koAuth from '../../../libs/i18n/locales/ko/web/auth.json';
import koCommon from '../../../libs/i18n/locales/ko/web/common.json';
import koDashboard from '../../../libs/i18n/locales/ko/web/dashboard.json';
import koLanding from '../../../libs/i18n/locales/ko/web/landing.json';
import koSettings from '../../../libs/i18n/locales/ko/web/settings.json';
import { defaultLocale, type Locale, LOCALE_COOKIE, locales } from './config';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const messages: Record<Locale, Record<string, any>> = {
  ko: {
    common: koCommon,
    landing: koLanding,
    dashboard: koDashboard,
    settings: koSettings,
    auth: koAuth,
    admin: koAdmin,
  },
  en: {
    common: enCommon,
    landing: enLanding,
    dashboard: enDashboard,
    settings: enSettings,
    auth: enAuth,
    admin: enAdmin,
  },
};

function negotiateLocale(acceptLanguage: string): Locale {
  const segments = acceptLanguage.split(',');
  for (const segment of segments) {
    const lang = segment.split(';')[0].trim().toLowerCase();
    const prefix = lang.slice(0, 2);
    if (locales.includes(prefix as Locale)) return prefix as Locale;
  }
  return defaultLocale;
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;

  if (cookieLocale && locales.includes(cookieLocale as Locale)) {
    const locale = cookieLocale as Locale;
    return { locale, messages: messages[locale] };
  }

  const headerStore = await headers();
  const acceptLang = headerStore.get('accept-language') ?? '';
  const detected = negotiateLocale(acceptLang);

  return { locale: detected, messages: messages[detected] };
});
