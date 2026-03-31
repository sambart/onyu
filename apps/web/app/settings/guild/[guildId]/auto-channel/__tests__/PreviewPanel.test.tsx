import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DiscordChannel } from '../../../../../lib/discord-api';
import { PreviewPanel } from '../components/PreviewPanel';
import type { ConfigForm } from '../types';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const voiceChannels: DiscordChannel[] = [
  { id: 'vc-1', name: '대기실', type: 2 },
];

const categories: DiscordChannel[] = [
  { id: 'cat-1', name: '게임방', type: 4 },
];

const baseConfig: ConfigForm = {
  name: '테스트 설정',
  triggerChannelId: '',
  mode: 'select',
  instantCategoryId: '',
  instantNameTemplate: '',
  guideChannelId: '',
  guideMessage: '',
  embedTitle: '',
  embedColor: '#5865F2',
  buttons: [],
};

describe('PreviewPanel', () => {
  describe('instant 모드', () => {
    it('채널 구조 미리보기를 렌더링한다', () => {
      const config: ConfigForm = {
        ...baseConfig,
        mode: 'instant',
        triggerChannelId: 'vc-1',
        instantCategoryId: 'cat-1',
        instantNameTemplate: '{username}의 채널',
      };

      render(
        <PreviewPanel
          config={config}
          voiceChannels={voiceChannels}
          categories={categories}
        />,
      );

      expect(screen.getByText('common.preview')).toBeInTheDocument();
      expect(screen.getByText('대기실')).toBeInTheDocument();
      expect(screen.getByText('(트리거)')).toBeInTheDocument();
      expect(screen.getByText('게임방')).toBeInTheDocument();
      // 템플릿에서 {username}을 'username'으로 치환한 예시 채널명
      expect(screen.getByText('username의 채널')).toBeInTheDocument();
      expect(screen.getByText('(생성 예시)')).toBeInTheDocument();
    });

    it('트리거/카테고리가 없으면 빈 상태 메시지를 표시한다', () => {
      const config: ConfigForm = {
        ...baseConfig,
        mode: 'instant',
        triggerChannelId: '',
        instantCategoryId: '',
      };

      render(
        <PreviewPanel
          config={config}
          voiceChannels={voiceChannels}
          categories={categories}
        />,
      );

      expect(screen.getByText('common.noDescription')).toBeInTheDocument();
    });

    it('instantNameTemplate이 비어있으면 기본값(username의 채널)으로 표시한다', () => {
      const config: ConfigForm = {
        ...baseConfig,
        mode: 'instant',
        triggerChannelId: '',
        instantCategoryId: 'cat-1',
        instantNameTemplate: '',
      };

      render(
        <PreviewPanel
          config={config}
          voiceChannels={voiceChannels}
          categories={categories}
        />,
      );

      expect(screen.getByText('username의 채널')).toBeInTheDocument();
    });
  });

  describe('select 모드', () => {
    it('Embed 미리보기를 렌더링한다', () => {
      const config: ConfigForm = {
        ...baseConfig,
        mode: 'select',
        embedTitle: '자동방 입장 안내',
        guideMessage: '게임을 선택하세요.',
        embedColor: '#5865F2',
      };

      render(
        <PreviewPanel
          config={config}
          voiceChannels={voiceChannels}
          categories={categories}
        />,
      );

      expect(screen.getByText('common.preview')).toBeInTheDocument();
      expect(screen.getByText('자동방 입장 안내')).toBeInTheDocument();
      expect(screen.getByText('게임을 선택하세요.')).toBeInTheDocument();
    });

    it('embedTitle이 없으면 제목을 표시하지 않는다', () => {
      const config: ConfigForm = {
        ...baseConfig,
        mode: 'select',
        embedTitle: '',
        guideMessage: '안내 메시지',
      };

      render(
        <PreviewPanel
          config={config}
          voiceChannels={voiceChannels}
          categories={categories}
        />,
      );

      expect(screen.queryByRole('heading')).toBeNull();
    });

    it('guideMessage가 없으면 noDescription을 표시한다', () => {
      const config: ConfigForm = {
        ...baseConfig,
        mode: 'select',
        guideMessage: '',
      };

      render(
        <PreviewPanel
          config={config}
          voiceChannels={voiceChannels}
          categories={categories}
        />,
      );

      expect(screen.getByText('common.noDescription')).toBeInTheDocument();
    });

    it('버튼이 있으면 버튼 라벨들을 Embed 내부에 표시한다', () => {
      const config: ConfigForm = {
        ...baseConfig,
        mode: 'select',
        guideMessage: '게임을 선택하세요.',
        buttons: [
          {
            label: '오버워치',
            emoji: '🎮',
            targetCategoryId: 'cat-1',
            channelNameTemplate: '',
            subOptions: [],
          },
          {
            label: '롤',
            emoji: '',
            targetCategoryId: 'cat-1',
            channelNameTemplate: '',
            subOptions: [],
          },
        ],
      };

      render(
        <PreviewPanel
          config={config}
          voiceChannels={voiceChannels}
          categories={categories}
        />,
      );

      expect(screen.getByText(/오버워치/)).toBeInTheDocument();
      expect(screen.getByText(/롤/)).toBeInTheDocument();
    });

    it('트리거 채널이 선택된 경우 채널명을 하단에 표시한다', () => {
      const config: ConfigForm = {
        ...baseConfig,
        mode: 'select',
        triggerChannelId: 'vc-1',
        guideMessage: '안내',
      };

      render(
        <PreviewPanel
          config={config}
          voiceChannels={voiceChannels}
          categories={categories}
        />,
      );

      expect(screen.getByText('대기실')).toBeInTheDocument();
      expect(screen.getByText('(트리거 채널)')).toBeInTheDocument();
    });
  });
});
