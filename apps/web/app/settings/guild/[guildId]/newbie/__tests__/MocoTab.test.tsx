import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { MocoTemplate, NewbieConfig } from '../../../../../lib/newbie-api';
import MocoTab from '../components/MocoTab';

// ─── 전역 모킹 ──────────────────────────────────────────────────

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}(${JSON.stringify(params)})`;
    return key;
  },
}));

// MocoTemplateSection은 복잡한 내부 상태와 하위 컴포넌트를 가지므로
// MocoTab 자체의 조건부 렌더링 로직에 집중하기 위해 모킹한다
vi.mock('../components/MocoTemplateSection', () => ({
  default: () => <div data-testid="moco-template-section" />,
}));

vi.mock('../components/MocoEmbedPreview', () => ({
  default: () => <div data-testid="moco-embed-preview" />,
}));

// ─── 공통 픽스처 ─────────────────────────────────────────────────

const BASE_CONFIG: NewbieConfig = {
  welcomeEnabled: false,
  welcomeChannelId: null,
  welcomeEmbedTitle: null,
  welcomeEmbedDescription: null,
  welcomeEmbedColor: null,
  welcomeEmbedThumbnailUrl: null,
  welcomeContent: null,
  missionEnabled: false,
  missionDurationDays: null,
  missionTargetPlaytimeHours: null,
  missionUseMicTime: false,
  missionTargetPlayCount: null,
  playCountMinDurationMin: null,
  playCountIntervalMin: null,
  missionNotifyChannelId: null,
  missionEmbedColor: null,
  missionDisplayMode: 'EMBED',
  mocoEnabled: true,
  mocoNewbieDays: 30,
  mocoAllowNewbieHunter: false,
  mocoRankChannelId: null,
  mocoAutoRefreshMinutes: null,
  mocoEmbedColor: '#5865F2',
  mocoDisplayMode: 'EMBED',
  mocoPlayCountMinDurationMin: null,
  mocoPlayCountIntervalMin: null,
  mocoMinCoPresenceMin: 10,
  mocoScorePerSession: 10,
  mocoScorePerMinute: 1,
  mocoScorePerUnique: 5,
  mocoResetPeriod: 'NONE',
  mocoResetIntervalDays: null,
  roleEnabled: false,
  roleDurationDays: null,
  newbieRoleId: null,
};

const BASE_MOCO_TEMPLATE: MocoTemplate = {
  titleTemplate: null,
  bodyTemplate: null,
  itemTemplate: null,
  footerTemplate: null,
  scoringTemplate: null,
};

function buildProps(configOverrides: Partial<NewbieConfig> = {}) {
  return {
    config: { ...BASE_CONFIG, ...configOverrides },
    channels: [],
    onChange: vi.fn(),
    mocoTemplate: BASE_MOCO_TEMPLATE,
    onMocoTemplateChange: vi.fn(),
    onSaveMocoTemplate: vi.fn(),
    isSavingMocoTemplate: false,
    mocoTemplateSaveError: null,
    mocoTemplateSaveSuccess: false,
  };
}

// ─── 테스트 ─────────────────────────────────────────────────────

describe('MocoTab', () => {
  describe('표시 방식 드롭다운', () => {
    it('표시 방식 드롭다운이 렌더링된다', () => {
      render(<MocoTab {...buildProps()} />);

      expect(screen.getByLabelText('newbie.moco.displayMode')).toBeInTheDocument();
    });

    it('EMBED와 CANVAS 옵션이 드롭다운에 존재한다', () => {
      render(<MocoTab {...buildProps()} />);

      const select = screen.getByLabelText('newbie.moco.displayMode');
      expect(select).toBeInTheDocument();
      expect(screen.getByText('newbie.moco.displayModeEmbed')).toBeInTheDocument();
      expect(screen.getByText('newbie.moco.displayModeCanvas')).toBeInTheDocument();
    });

    it('config.mocoDisplayMode가 EMBED이면 드롭다운에 EMBED가 선택된다', () => {
      render(<MocoTab {...buildProps({ mocoDisplayMode: 'EMBED' })} />);

      const select = screen.getByLabelText<HTMLSelectElement>('newbie.moco.displayMode');
      expect(select.value).toBe('EMBED');
    });

    it('config.mocoDisplayMode가 CANVAS이면 드롭다운에 CANVAS가 선택된다', () => {
      render(<MocoTab {...buildProps({ mocoDisplayMode: 'CANVAS' })} />);

      const select = screen.getByLabelText<HTMLSelectElement>('newbie.moco.displayMode');
      expect(select.value).toBe('CANVAS');
    });

    it('config.mocoDisplayMode가 undefined이면 드롭다운의 기본값은 EMBED이다', () => {
      const props = buildProps();
      // mocoDisplayMode를 undefined로 설정하여 fallback 동작 검증
      const config = { ...props.config };
      delete (config as Partial<NewbieConfig>).mocoDisplayMode;
      render(<MocoTab {...props} config={config as NewbieConfig} />);

      const select = screen.getByLabelText<HTMLSelectElement>('newbie.moco.displayMode');
      expect(select.value).toBe('EMBED');
    });

    it('사용자가 드롭다운을 CANVAS로 변경하면 onChange가 올바른 값으로 호출된다', async () => {
      const user = userEvent.setup();
      const props = buildProps({ mocoDisplayMode: 'EMBED' });

      render(<MocoTab {...props} />);
      await user.selectOptions(screen.getByLabelText('newbie.moco.displayMode'), 'CANVAS');

      expect(props.onChange).toHaveBeenCalledWith({ mocoDisplayMode: 'CANVAS' });
    });

    it('사용자가 드롭다운을 EMBED로 변경하면 onChange가 올바른 값으로 호출된다', async () => {
      const user = userEvent.setup();
      const props = buildProps({ mocoDisplayMode: 'CANVAS' });

      render(<MocoTab {...props} />);
      await user.selectOptions(screen.getByLabelText('newbie.moco.displayMode'), 'EMBED');

      expect(props.onChange).toHaveBeenCalledWith({ mocoDisplayMode: 'EMBED' });
    });

    it('기능이 비활성화(mocoEnabled: false)이면 드롭다운이 disabled 상태이다', () => {
      render(<MocoTab {...buildProps({ mocoEnabled: false })} />);

      const select = screen.getByLabelText('newbie.moco.displayMode');
      expect(select).toBeDisabled();
    });

    it('기능이 활성화(mocoEnabled: true)이면 드롭다운이 활성화 상태이다', () => {
      render(<MocoTab {...buildProps({ mocoEnabled: true })} />);

      const select = screen.getByLabelText('newbie.moco.displayMode');
      expect(select).not.toBeDisabled();
    });
  });

  describe('EMBED 모드에서의 조건부 렌더링', () => {
    it('EMBED 모드에서 Embed 외관 & 템플릿 섹션이 표시된다', () => {
      render(<MocoTab {...buildProps({ mocoDisplayMode: 'EMBED' })} />);

      expect(screen.getByText('newbie.moco.embedSection')).toBeInTheDocument();
    });

    it('EMBED 모드에서 Canvas 안내 텍스트는 표시되지 않는다', () => {
      render(<MocoTab {...buildProps({ mocoDisplayMode: 'EMBED' })} />);

      expect(screen.queryByText('newbie.moco.canvasInfo')).not.toBeInTheDocument();
    });

    it('mocoDisplayMode가 설정되지 않은 경우(기본값 EMBED) Embed 섹션이 표시된다', () => {
      // mocoDisplayMode가 null/undefined인 경우 !== 'CANVAS' 조건으로 EMBED 섹션이 표시된다
      const props = buildProps();
      const config = { ...props.config, mocoDisplayMode: null as unknown as 'EMBED' | 'CANVAS' };
      render(<MocoTab {...props} config={config} />);

      expect(screen.getByText('newbie.moco.embedSection')).toBeInTheDocument();
    });
  });

  describe('CANVAS 모드에서의 조건부 렌더링', () => {
    it('CANVAS 모드에서 Embed 외관 & 템플릿 섹션이 숨겨진다', () => {
      render(<MocoTab {...buildProps({ mocoDisplayMode: 'CANVAS' })} />);

      expect(screen.queryByText('newbie.moco.embedSection')).not.toBeInTheDocument();
    });

    it('CANVAS 모드에서 Canvas 안내 텍스트가 표시된다', () => {
      render(<MocoTab {...buildProps({ mocoDisplayMode: 'CANVAS' })} />);

      expect(screen.getByText('newbie.moco.canvasInfo')).toBeInTheDocument();
    });

    it('CANVAS 모드에서 안내 텍스트는 파란 배경 박스 안에 표시된다', () => {
      render(<MocoTab {...buildProps({ mocoDisplayMode: 'CANVAS' })} />);

      const infoText = screen.getByText('newbie.moco.canvasInfo');
      const infoBox = infoText.closest('div');
      expect(infoBox).toHaveClass('bg-blue-50');
    });
  });

  describe('EMBED/CANVAS 모드 전환 시 UI 변화', () => {
    it('EMBED에서 CANVAS로 전환되면 Embed 섹션이 사라지고 Canvas 안내가 나타난다', async () => {
      const user = userEvent.setup();
      const props = buildProps({ mocoDisplayMode: 'EMBED' });
      const { rerender } = render(<MocoTab {...props} />);

      // EMBED 모드: Embed 섹션 있음, Canvas 안내 없음
      expect(screen.getByText('newbie.moco.embedSection')).toBeInTheDocument();
      expect(screen.queryByText('newbie.moco.canvasInfo')).not.toBeInTheDocument();

      // 사용자가 CANVAS로 변경
      await user.selectOptions(screen.getByLabelText('newbie.moco.displayMode'), 'CANVAS');

      // onChange가 호출되면 부모가 config를 업데이트하여 재렌더링 → rerender로 시뮬레이션
      rerender(<MocoTab {...props} config={{ ...props.config, mocoDisplayMode: 'CANVAS' }} />);

      expect(screen.queryByText('newbie.moco.embedSection')).not.toBeInTheDocument();
      expect(screen.getByText('newbie.moco.canvasInfo')).toBeInTheDocument();
    });

    it('CANVAS에서 EMBED로 전환되면 Canvas 안내가 사라지고 Embed 섹션이 나타난다', async () => {
      const user = userEvent.setup();
      const props = buildProps({ mocoDisplayMode: 'CANVAS' });
      const { rerender } = render(<MocoTab {...props} />);

      // CANVAS 모드: Canvas 안내 있음, Embed 섹션 없음
      expect(screen.getByText('newbie.moco.canvasInfo')).toBeInTheDocument();
      expect(screen.queryByText('newbie.moco.embedSection')).not.toBeInTheDocument();

      // 사용자가 EMBED로 변경
      await user.selectOptions(screen.getByLabelText('newbie.moco.displayMode'), 'EMBED');

      rerender(<MocoTab {...props} config={{ ...props.config, mocoDisplayMode: 'EMBED' }} />);

      expect(screen.queryByText('newbie.moco.canvasInfo')).not.toBeInTheDocument();
      expect(screen.getByText('newbie.moco.embedSection')).toBeInTheDocument();
    });
  });

  describe('기본 설정 섹션', () => {
    it('기본 설정 섹션이 항상 렌더링된다', () => {
      render(<MocoTab {...buildProps({ mocoDisplayMode: 'EMBED' })} />);
      expect(screen.getByText('newbie.moco.basicSettings')).toBeInTheDocument();
    });

    it('CANVAS 모드에서도 기본 설정 섹션이 렌더링된다', () => {
      render(<MocoTab {...buildProps({ mocoDisplayMode: 'CANVAS' })} />);
      expect(screen.getByText('newbie.moco.basicSettings')).toBeInTheDocument();
    });
  });
});
