import { Logger } from '@nestjs/common';
import type { BotApiClientService } from '@onyu/bot-api-client';

const logger = new Logger('WaitForApi');

const DEFAULT_MAX_RETRIES = 15;
const DEFAULT_INTERVAL_MS = 4000;

/**
 * API 서버가 응답할 때까지 반복 대기한다.
 * 봇이 API보다 먼저 ready 되는 경우를 대비한다.
 * @returns true: 연결 성공, false: 최대 재시도 초과
 */
export async function waitForApi(
  apiClient: BotApiClientService,
  maxRetries = DEFAULT_MAX_RETRIES,
  intervalMs = DEFAULT_INTERVAL_MS,
): Promise<boolean> {
  for (let i = 1; i <= maxRetries; i++) {
    try {
      await apiClient.healthCheck();
      logger.log(`API 연결 성공 (attempt ${i})`);
      return true;
    } catch {
      logger.warn(`API 연결 대기 중... (${i}/${maxRetries})`);
      await sleep(intervalMs);
    }
  }
  logger.error(`API 연결 실패 — ${maxRetries}회 시도 후 포기`);
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
