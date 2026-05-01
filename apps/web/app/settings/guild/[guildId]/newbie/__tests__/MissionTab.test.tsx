/**
 * MissionTab 통합 테스트
 *
 * missionUseMicTime 체크박스의 렌더링·토글·경고·배지 동작을 유저 행동 관점에서 검증한다.
 *
 * - 체크박스 렌더링: 라벨, 도움말 텍스트 존재 확인
 * - false → true 토글 시 onChange 호출
 * - 초기값과 다르게 변경 시 경고 문구 표시
 * - 초기값으로 복귀 시 경고 사라짐
 * - 체크 상태일 때 basicSummary에 배지 텍스트 반영
 *
 * next-intl은 키를 그대로 반환하는 stub으로 대체한다.
 * CollapsibleSection, MissionTemplateSection, MissionEmbedPreview는 내부 상태 복잡도를
 * 격리하기 위해 필요한 것만 모킹한다.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { MissionTemplate, NewbieConfig } from '../../../../../lib/newbie-api';
import MissionTab from '../components/MissionTab';

// ─── 전역 모킹 ──────────────────────────────────────────────────────────────

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}(${JSON.stringify(params)})`;
    return key;
  },
}));

// MissionTemplateSection은 복잡한 내부 상태와 API 의존성이 있으므로
// MissionTab의 조건부 렌더링 로직 검증에 집중하기 위해 모킹한다
vi.mock('../components/MissionTemplateSection', () => ({
  default: () => <div data-testid="mission-template-section" />,
}));

vi.mock('../components/MissionEmbedPreview', () => ({
  default: () => <div data-testid="mission-embed-preview" />,
}));

// ─── 공통 픽스처 ─────────────────────────────────────────────────────────────

const BASE_CONFIG: NewbieConfig = {
  welcomeEnabled: false,
  welcomeChannelId: null,
  welcomeEmbedTitle: null,
  welcomeEmbedDescription: null,
  welcomeEmbedColor: null,
  welcomeEmbedThumbnailUrl: null,
  welcomeContent: null,
  missionEnabled: true,
  missionDurationDays: 7,
  missionTargetPlaytimeHours: 10,
  missionUseMicTime: false,
  missionTargetPlayCount: null,
  playCountMinDurationMin: null,
  playCountIntervalMin: null,
  missionNotifyChannelId: null,
  missionEmbedColor: null,
  missionDisplayMode: 'EMBED',
  mocoEnabled: false,
  mocoNewbieDays: 30,
  mocoAllowNewbieHunter: false,
  mocoRankChannelId: null,
  mocoAutoRefreshMinutes: null,
  mocoEmbedColor: null,
  mocoDisplayMode: 'EMBED',
  mocoPlayCountMinDurationMin: null,
  mocoPlayCountIntervalMin: null,
  mocoMinCoPresenceMin: null,
  mocoScorePerSession: null,
  mocoScorePerMinute: null,
  mocoScorePerUnique: null,
  mocoResetPeriod: null,
  mocoResetIntervalDays: null,
  roleEnabled: false,
  roleDurationDays: null,
  newbieRoleId: null,
};

const BASE_MISSION_TEMPLATE: MissionTemplate = {
  titleTemplate: null,
  bodyTemplate: null,
  itemTemplate: null,
  footerTemplate: null,
};

function buildProps(configOverrides: Partial<NewbieConfig> = {}) {
  return {
    config: { ...BASE_CONFIG, ...configOverrides },
    channels: [],
    emojis: [],
    onChange: vi.fn(),
    missionTemplate: BASE_MISSION_TEMPLATE,
    onMissionTemplateChange: vi.fn(),
    onSaveMissionTemplate: vi.fn(),
    isSavingMissionTemplate: false,
    missionTemplateSaveError: null,
    missionTemplateSaveSuccess: false,
  };
}

// ─── 테스트 ─────────────────────────────────────────────────────────────────

describe('MissionTab — missionUseMicTime 체크박스', () => {
  describe('체크박스 렌더링', () => {
    it('체크박스가 연결된 라벨로 렌더링된다', () => {
      render(<MissionTab {...buildProps()} />);

      // getByLabelText: 라벨과 input이 올바르게 연결되었는지 접근성 기준으로 검증
      const checkbox = screen.getByLabelText('newbie.mission.useMicTime');
      expect(checkbox).toBeInTheDocument();
    });

    it('도움말 텍스트(useMicTimeDesc)가 표시된다', () => {
      render(<MissionTab {...buildProps()} />);

      expect(screen.getByText('newbie.mission.useMicTimeDesc')).toBeInTheDocument();
    });

    it('초기값 false이면 체크박스가 체크 해제 상태이다', () => {
      render(<MissionTab {...buildProps({ missionUseMicTime: false })} />);

      const checkbox = screen.getByLabelText<HTMLInputElement>('newbie.mission.useMicTime');
      expect(checkbox.checked).toBe(false);
    });

    it('초기값 true이면 체크박스가 체크 상태이다', () => {
      render(<MissionTab {...buildProps({ missionUseMicTime: true })} />);

      const checkbox = screen.getByLabelText<HTMLInputElement>('newbie.mission.useMicTime');
      expect(checkbox.checked).toBe(true);
    });

    it('missionEnabled=false이면 체크박스가 disabled 상태이다', () => {
      render(<MissionTab {...buildProps({ missionEnabled: false })} />);

      const checkbox = screen.getByLabelText('newbie.mission.useMicTime');
      expect(checkbox).toBeDisabled();
    });

    it('missionEnabled=true이면 체크박스가 활성화 상태이다', () => {
      render(<MissionTab {...buildProps({ missionEnabled: true })} />);

      const checkbox = screen.getByLabelText('newbie.mission.useMicTime');
      expect(checkbox).not.toBeDisabled();
    });
  });

  describe('토글 시 onChange 호출', () => {
    it('false 상태에서 체크박스 클릭 시 onChange가 missionUseMicTime: true로 호출된다', async () => {
      const user = userEvent.setup();
      const props = buildProps({ missionUseMicTime: false });

      render(<MissionTab {...props} />);

      const checkbox = screen.getByLabelText('newbie.mission.useMicTime');
      await user.click(checkbox);

      expect(props.onChange).toHaveBeenCalledWith({ missionUseMicTime: true });
    });

    it('true 상태에서 체크박스 클릭 시 onChange가 missionUseMicTime: false로 호출된다', async () => {
      const user = userEvent.setup();
      const props = buildProps({ missionUseMicTime: true });

      render(<MissionTab {...props} />);

      const checkbox = screen.getByLabelText('newbie.mission.useMicTime');
      await user.click(checkbox);

      expect(props.onChange).toHaveBeenCalledWith({ missionUseMicTime: false });
    });
  });

  describe('경고 문구 표시 조건 (초기값 대비 변경 감지)', () => {
    it('초기값(false)과 동일한 현재값이면 경고 문구가 표시되지 않는다', () => {
      // 초기값=false, 현재값=false → isChanged=false
      render(<MissionTab {...buildProps({ missionUseMicTime: false })} />);

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('초기값(true)과 동일한 현재값이면 경고 문구가 표시되지 않는다', () => {
      // 초기값=true, 현재값=true → isChanged=false
      render(<MissionTab {...buildProps({ missionUseMicTime: true })} />);

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('초기값(false)에서 현재값이 true로 변경되면 경고 문구가 표시된다', async () => {
      const user = userEvent.setup();
      // 초기 렌더: missionUseMicTime=false (useRef에 false가 저장됨)
      const props = buildProps({ missionUseMicTime: false });
      const { rerender } = render(<MissionTab {...props} />);

      // 사용자가 체크 → 부모가 config 업데이트 → rerender로 시뮬레이션
      await user.click(screen.getByLabelText('newbie.mission.useMicTime'));
      rerender(<MissionTab {...props} config={{ ...props.config, missionUseMicTime: true }} />);

      // useRef.current=false, value=true → isChanged=true → 경고 표시
      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveTextContent('newbie.mission.useMicTimeWarning');
    });

    it('초기값(true)에서 현재값이 false로 변경되면 경고 문구가 표시된다', async () => {
      const user = userEvent.setup();
      const props = buildProps({ missionUseMicTime: true });
      const { rerender } = render(<MissionTab {...props} />);

      await user.click(screen.getByLabelText('newbie.mission.useMicTime'));
      rerender(<MissionTab {...props} config={{ ...props.config, missionUseMicTime: false }} />);

      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveTextContent('newbie.mission.useMicTimeWarning');
    });

    it('변경 후 초기값으로 다시 복귀하면 경고 문구가 사라진다', async () => {
      const user = userEvent.setup();
      const props = buildProps({ missionUseMicTime: false });
      const { rerender } = render(<MissionTab {...props} />);

      // false → true 변경
      await user.click(screen.getByLabelText('newbie.mission.useMicTime'));
      rerender(<MissionTab {...props} config={{ ...props.config, missionUseMicTime: true }} />);
      expect(screen.getByRole('alert')).toBeInTheDocument();

      // true → false 복귀 (초기값과 동일)
      await user.click(screen.getByLabelText('newbie.mission.useMicTime'));
      rerender(<MissionTab {...props} config={{ ...props.config, missionUseMicTime: false }} />);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('basicSummary 배지 표시', () => {
    it('missionUseMicTime=true이면 기본 설정 섹션 요약에 배지 텍스트가 포함된다', async () => {
      // CollapsibleSection은 defaultOpen=false 상태에서 summary를 헤더에 표시한다.
      // 기본 설정 섹션은 defaultOpen=true이므로 펼쳐져 summary가 숨겨진다.
      // 헤더 버튼 클릭(닫기) 후 summary가 DOM에 나타나는 것을 검증한다.
      const user = userEvent.setup();
      render(<MissionTab {...buildProps({ missionUseMicTime: true })} />);

      // 기본 설정 섹션 헤더 버튼: CollapsibleSection 내부 <span>{title}</span>을 포함한 <button>
      // getByText로 title span을 찾고 closest('button')으로 버튼을 얻는다
      const titleSpan = screen.getByText('newbie.mission.basicSettings');
      const sectionButton = titleSpan.closest('button');
      expect(sectionButton).not.toBeNull();
      await user.click(sectionButton!);

      // 닫힌 상태에서 summary가 표시된다.
      // basicSummary는 여러 항목을 ' · '로 join한 단일 문자열이므로 부분 매칭을 사용한다.
      expect(
        screen.getByText((content) => content.includes('newbie.mission.useMicTimeBadge')),
      ).toBeInTheDocument();
    });

    it('missionUseMicTime=false이면 배지 텍스트가 summary에 포함되지 않는다', async () => {
      const user = userEvent.setup();
      render(<MissionTab {...buildProps({ missionUseMicTime: false })} />);

      // 기본 설정 섹션 닫기 → summary 표시 시도
      const titleSpan = screen.getByText('newbie.mission.basicSettings');
      const sectionButton = titleSpan.closest('button');
      expect(sectionButton).not.toBeNull();
      await user.click(sectionButton!);

      // 배지 텍스트는 summary에 포함되지 않아야 한다
      expect(screen.queryByText('newbie.mission.useMicTimeBadge')).not.toBeInTheDocument();
    });
  });
});
