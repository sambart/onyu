/**
 * MusicSettingsPage — 서버 미선택 상태 테스트
 *
 * vi.mock은 파일 레벨에서 호이스팅되므로 selectedGuildId가 빈 문자열인 시나리오는
 * 별도 파일에서 독립적으로 테스트한다.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import MusicSettingsPage from '../page';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// selectedGuildId가 빈 문자열인 시나리오
vi.mock('../../../../SettingsContext', () => ({
  useSettings: () => ({ selectedGuildId: '' }),
}));

vi.mock('../../../../../lib/discord-api', () => ({
  fetchGuildTextChannels: vi.fn().mockResolvedValue([]),
  fetchGuildEmojis: vi.fn().mockResolvedValue([]),
  fetchGuildChannels: vi.fn().mockResolvedValue([]),
  formatEmojiString: vi.fn(),
  getEmojiCdnUrl: vi.fn(() => ''),
}));

describe('MusicSettingsPage - 서버 미선택 상태', () => {
  it('selectedGuildId가 없으면 서버 선택 안내 메시지가 표시된다', async () => {
    render(<MusicSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('common.selectServer')).toBeInTheDocument();
    });
  });

  it('서버 미선택 상태에서는 로딩 스피너나 설정 폼이 표시되지 않는다', async () => {
    render(<MusicSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('common.selectServer')).toBeInTheDocument();
    });

    // 로딩 중이거나 폼이 표시되지 않아야 한다
    expect(screen.queryByText('music.basicSettings')).toBeNull();
  });
});
