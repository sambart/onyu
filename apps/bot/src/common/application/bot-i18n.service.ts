import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

const SUPPORTED_LOCALES = ['ko', 'en'];
const BOT_NAMESPACES = ['commands', 'voice', 'newbie', 'inactive', 'errors', 'role-panel'];
const DEFAULT_LOCALE = 'en';

/**
 * 봇 응답 번역 서비스.
 * 앱 시작 시 JSON 파일을 메모리에 로딩하고, t() 메서드로 번역 문자열을 반환한다.
 */
@Injectable()
export class BotI18nService implements OnModuleInit {
  private readonly logger = new Logger(BotI18nService.name);
  private messages: Record<string, Record<string, Record<string, string>>> = {};

  onModuleInit() {
    this.loadAllMessages();
  }

  /**
   * 번역 문자열을 반환한다.
   * @param locale 요청 locale (ko, en)
   * @param key "namespace.key" 형식 (예: "voice.leaderboard.title")
   * @param params 변수 치환 맵 (예: { days: 7 })
   */
  t(locale: string, key: string, params?: Record<string, string | number>): string {
    const [ns, ...rest] = key.split('.');
    const msgKey = rest.join('.');

    const template =
      this.messages[locale]?.[ns]?.[msgKey] ?? this.messages[DEFAULT_LOCALE]?.[ns]?.[msgKey] ?? key;

    return params ? this.interpolate(template, params) : template;
  }

  private interpolate(template: string, params: Record<string, string | number>): string {
    return template.replace(/\{(\w+)\}/g, (_, key: string) =>
      params[key] !== undefined ? String(params[key]) : `{${key}}`,
    );
  }

  private loadAllMessages() {
    const i18nRoot = path.resolve(__dirname, '../../../../../libs/i18n/locales');

    for (const locale of SUPPORTED_LOCALES) {
      this.messages[locale] = {};
      for (const ns of BOT_NAMESPACES) {
        const filePath = path.join(i18nRoot, locale, 'bot', `${ns}.json`);
        this.loadNamespace(locale, ns, filePath);
      }
    }

    const totalKeys = Object.values(this.messages).reduce(
      (sum, localeMessages) =>
        sum + Object.values(localeMessages).reduce((s, ns) => s + Object.keys(ns).length, 0),
      0,
    );
    this.logger.log(
      `Bot i18n loaded: ${totalKeys} keys across ${SUPPORTED_LOCALES.length} locales`,
    );
  }

  private loadNamespace(locale: string, ns: string, filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        this.messages[locale][ns] = JSON.parse(content) as Record<string, string>;
      } else {
        this.messages[locale][ns] = {};
      }
    } catch {
      this.logger.warn(`Failed to load i18n file: ${filePath}`);
      this.messages[locale][ns] = {};
    }
  }
}
