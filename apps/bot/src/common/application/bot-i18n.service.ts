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
    const i18nRoot = this.resolveLocalesRoot();

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

  /**
   * `libs/i18n/locales` 디렉토리를 안정적으로 해석한다.
   *
   * `__dirname` 의 깊이가 소스(ts-node: `apps/bot/src/...`)와 빌드(dist: `apps/bot/dist/apps/bot/src/...`)
   * 레이아웃에서 다르기 때문에, 고정된 상대경로(`../../../../../`)는 dist(prod)에서 어긋난다.
   * 상위 디렉토리를 탐색해 `libs/i18n/locales` 가 실재하는 경로를 찾는다.
   */
  private resolveLocalesRoot(): string {
    const MAX_DEPTH = 12;
    let dir = __dirname;
    for (let i = 0; i < MAX_DEPTH; i++) {
      const candidate = path.join(dir, 'libs', 'i18n', 'locales');
      if (fs.existsSync(candidate)) {
        return candidate;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    this.logger.error(
      `i18n locales 디렉토리를 찾을 수 없습니다 (탐색 시작=${__dirname}). 번역 키가 원문으로 노출됩니다.`,
    );
    // 최후 폴백 (소스 레이아웃 기준)
    return path.resolve(__dirname, '../../../../../libs/i18n/locales');
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
