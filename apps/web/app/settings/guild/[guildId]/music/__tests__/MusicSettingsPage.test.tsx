/**
 * MusicSettingsPage 통합 테스트 (F-WEB-014)
 *
 * 유저 행동 관점에서 음악 설정 페이지 전체 흐름을 검증한다.
 * - 초기 로딩 → 폼 렌더링 → 사용자 입력 → 저장/초기화 → 피드백 메시지
 *
 * API 모듈을 vi.mock으로 직접 처리하여 fetch 레이어 의존성을 제거한다.
 * 구현 세부사항(DOM 구조, CSS 클래스)이 아닌 사용자에게 보이는 결과를 검증한다.
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// static import로 vi.mocked를 사용한다 (dynamic import 방식의 타이밍 문제 회피)
import * as discordApi from '../../../../../lib/discord-api';
import type { MusicChannelConfig } from '../../../../../lib/music-config-api';
import * as musicConfigApi from '../../../../../lib/music-config-api';
import MusicSettingsPage from '../page';

// ─── 전역 모킹 ──────────────────────────────────────────────────────────────

// t 함수를 모듈 레벨에서 고정 인스턴스로 생성한다.
// useEffect 의존성 배열에 t가 포함되어 있으므로, 매 렌더마다 새 인스턴스가
// 생성되면 effect가 무한 재실행된다. 고정 인스턴스로 이를 방지한다.
const STABLE_T = (key: string, params?: Record<string, unknown>) => {
  if (params) return `${key}(${JSON.stringify(params)})`;
  return key;
};

vi.mock('next-intl', () => ({
  useTranslations: () => STABLE_T,
}));

vi.mock('../../../../SettingsContext', () => ({
  useSettings: () => ({ selectedGuildId: 'guild-123' }),
}));

vi.mock('../../../../../lib/discord-api', () => ({
  fetchGuildTextChannels: vi.fn(),
  fetchGuildEmojis: vi.fn(),
  fetchGuildChannels: vi.fn(),
  formatEmojiString: vi.fn((e: { name: string; id: string; animated: boolean }) =>
    e.animated ? `<a:${e.name}:${e.id}>` : `<:${e.name}:${e.id}>`,
  ),
  getEmojiCdnUrl: vi.fn(() => 'https://cdn.example.com/emoji.png'),
}));

// music-config-api를 vi.mock으로 처리하여 apiClient/fetch 레이어 의존성을 제거한다
vi.mock('../../../../../lib/music-config-api', () => ({
  fetchMusicConfig: vi.fn(),
  saveMusicConfig: vi.fn(),
  resetMusicConfig: vi.fn(),
}));

// ─── 픽스처 ────────────────────────────────────────────────────────────────

const CONFIG_FIXTURE: MusicChannelConfig = {
  id: 1,
  guildId: 'guild-123',
  channelId: 'ch-001',
  messageId: 'msg-001',
  embedTitle: '음악 플레이어',
  embedDescription: '버튼을 눌러 음악을 재생하세요.',
  embedColor: '#5865F2',
  embedThumbnailUrl: null,
  buttons: [
    { type: 'search', label: '음악 검색하기', emoji: '🔍', enabled: true, row: 0 },
    { type: 'pause_resume', label: '일시정지/재개', emoji: '⏯️', enabled: true, row: 1 },
    { type: 'skip', label: '스킵', emoji: '⏭️', enabled: true, row: 1 },
    { type: 'stop', label: '정지', emoji: '⏹️', enabled: true, row: 1 },
    { type: 'queue', label: '재생목록', emoji: '📋', enabled: true, row: 2 },
    { type: 'melon_chart', label: '멜론차트', emoji: '🎵', enabled: true, row: 2 },
    { type: 'billboard_chart', label: '빌보드', emoji: '🎶', enabled: true, row: 2 },
  ],
  enabled: true,
};

// ─── 헬퍼 ───────────────────────────────────────────────────────────────────

/**
 * 기능 활성화 toggle을 반환한다.
 * 'music.enableFeature' 텍스트 주변의 컨테이너에서 switch를 찾는다.
 */
function getEnableToggle() {
  const text = screen.getByText('music.enableFeature');
  // <p>music.enableFeature</p>의 부모 <div> → 그 부모 <div class="flex items-center justify-between">
  const container = text.parentElement?.parentElement as HTMLElement;
  return within(container).getByRole('switch');
}

/**
 * 버튼 타입 카드에서 해당 버튼의 toggle을 반환한다.
 * 버튼 타입 텍스트(span)와 같은 헤더 div에 toggle이 있다.
 */
function getButtonToggle(buttonTypeText: string) {
  const typeSpan = screen.getByText(buttonTypeText);
  // 헤더 div (flex items-center justify-between) 내에서 switch를 찾는다
  const headerDiv = typeSpan.closest('div')?.parentElement as HTMLElement;
  return within(headerDiv).getByRole('switch');
}

/**
 * 페이지를 렌더링하고 로딩 완료(기본 설정 섹션 출현)까지 기다린다.
 */
async function renderAndWaitForLoad() {
  const result = render(<MusicSettingsPage />);
  await waitFor(() => {
    expect(screen.getByText('music.basicSettings')).toBeInTheDocument();
  });
  return result;
}

// ─── 테스트 ─────────────────────────────────────────────────────────────────

describe('MusicSettingsPage 통합 테스트', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // discord-api 기본 mock 동작 설정
    vi.mocked(discordApi.fetchGuildTextChannels).mockResolvedValue([
      { id: 'ch-001', name: '일반', type: 0 },
      { id: 'ch-002', name: '음악방', type: 0 },
    ]);
    vi.mocked(discordApi.fetchGuildEmojis).mockResolvedValue([]);
    // music-config-api 기본 mock 동작: 설정 없음
    vi.mocked(musicConfigApi.fetchMusicConfig).mockResolvedValue(null);
    vi.mocked(musicConfigApi.saveMusicConfig).mockResolvedValue(CONFIG_FIXTURE);
    vi.mocked(musicConfigApi.resetMusicConfig).mockResolvedValue(CONFIG_FIXTURE);
  });

  // ── 초기 로딩 상태 ──────────────────────────────────────────────────────

  describe('초기 로딩', () => {
    it('로딩 중에는 스피너가 표시된다', async () => {
      render(<MusicSettingsPage />);

      // 로딩 스피너는 동기적으로 즉시 렌더링된다
      expect(document.querySelector('.animate-spin')).toBeInTheDocument();

      // 비동기 상태 정리를 위해 로딩 완료까지 대기
      await waitFor(() => {
        expect(screen.getByText('music.basicSettings')).toBeInTheDocument();
      });
    });

    it('설정이 없는 서버에서 로드하면 기본값으로 폼이 초기화된다', async () => {
      await renderAndWaitForLoad();

      // 기능 활성화 toggle이 기본값 true(활성)로 렌더링된다
      const toggle = getEnableToggle();
      expect(toggle).toHaveAttribute('aria-checked', 'true');

      // 채널 드롭다운이 "채널 선택 없음" 상태로 렌더링된다
      const channelSelect = screen.getByLabelText('music.channelLabel');
      expect(channelSelect).toHaveValue('');
    });

    it('기존 설정이 있으면 폼 필드에 값이 반영된다', async () => {
      vi.mocked(musicConfigApi.fetchMusicConfig).mockResolvedValue(CONFIG_FIXTURE);

      await renderAndWaitForLoad();

      // 채널 드롭다운에 저장된 채널 ID가 선택된다
      const channelSelect = screen.getByLabelText('music.channelLabel');
      expect(channelSelect).toHaveValue('ch-001');

      // 임베드 제목 입력 필드에 저장된 값이 표시된다
      const titleInput = screen.getByLabelText('common.embedTitle');
      expect(titleInput).toHaveValue('음악 플레이어');

      // 임베드 설명 텍스트에리어에 저장된 값이 표시된다
      const descTextarea = screen.getByLabelText('common.embedDescription');
      expect(descTextarea).toHaveValue('버튼을 눌러 음악을 재생하세요.');
    });

    it('기존 설정에서 비활성화된 상태(enabled: false)이면 폼이 비활성화된다', async () => {
      vi.mocked(musicConfigApi.fetchMusicConfig).mockResolvedValue({
        ...CONFIG_FIXTURE,
        enabled: false,
      });

      await renderAndWaitForLoad();

      const toggle = getEnableToggle();
      expect(toggle).toHaveAttribute('aria-checked', 'false');

      // 비활성화 시 채널 드롭다운이 disabled 처리된다
      const channelSelect = screen.getByLabelText('music.channelLabel');
      expect(channelSelect).toBeDisabled();
    });

    it('채널 목록이 드롭다운에 렌더링된다', async () => {
      await renderAndWaitForLoad();

      // fetchGuildTextChannels 결과로 반환된 채널들이 옵션으로 표시된다
      expect(screen.getByRole('option', { name: /# 일반/ })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /# 음악방/ })).toBeInTheDocument();
    });
  });

  // ── 기능 활성화 토글 ────────────────────────────────────────────────────

  describe('기능 활성화/비활성화 토글', () => {
    it('활성화 토글을 클릭하면 비활성화 상태가 되고 폼 입력이 disabled된다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      const toggle = getEnableToggle();
      await user.click(toggle);

      await waitFor(() => {
        expect(toggle).toHaveAttribute('aria-checked', 'false');
      });

      // 비활성화 시 임베드 제목 입력 필드가 disabled된다
      expect(screen.getByLabelText('common.embedTitle')).toBeDisabled();
      // 채널 드롭다운도 disabled된다
      expect(screen.getByLabelText('music.channelLabel')).toBeDisabled();
    });

    it('비활성화 상태에서 토글을 다시 클릭하면 활성화되고 폼이 활성화된다', async () => {
      vi.mocked(musicConfigApi.fetchMusicConfig).mockResolvedValue({
        ...CONFIG_FIXTURE,
        enabled: false,
      });

      const user = userEvent.setup();
      await renderAndWaitForLoad();

      const toggle = getEnableToggle();
      await user.click(toggle);

      await waitFor(() => {
        expect(toggle).toHaveAttribute('aria-checked', 'true');
      });
      expect(screen.getByLabelText('common.embedTitle')).not.toBeDisabled();
    });
  });

  // ── 채널 선택 ────────────────────────────────────────────────────────────

  describe('텍스트 채널 선택', () => {
    it('드롭다운에서 채널을 선택하면 해당 채널이 선택 상태로 변경된다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      const channelSelect = screen.getByLabelText('music.channelLabel');
      await user.selectOptions(channelSelect, 'ch-002');

      expect(channelSelect).toHaveValue('ch-002');
    });
  });

  // ── 임베드 설정 변경 및 미리보기 반영 ──────────────────────────────────

  describe('임베드 설정 변경 및 실시간 미리보기', () => {
    it('임베드 제목 입력 시 미리보기 패널에 즉시 반영된다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      const titleInput = screen.getByLabelText('common.embedTitle');
      await user.clear(titleInput);
      await user.type(titleInput, '내 음악 플레이어');

      // 입력값이 반영되면 noTitle 플레이스홀더가 사라진다 (미리보기 업데이트 증명)
      await waitFor(() => {
        expect(titleInput).toHaveValue('내 음악 플레이어');
        expect(screen.queryByText('common.noTitle')).toBeNull();
      });
    });

    it('임베드 설명 입력 시 미리보기 패널에 즉시 반영된다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      const descTextarea = screen.getByLabelText('common.embedDescription');
      await user.clear(descTextarea);
      await user.type(descTextarea, '원하는 음악을 검색하세요.');

      // 입력값이 반영되면 noDescription 플레이스홀더가 사라진다
      await waitFor(() => {
        expect(descTextarea).toHaveValue('원하는 음악을 검색하세요.');
        expect(screen.queryByText('common.noDescription')).toBeNull();
      });
    });

    it('임베드 제목이 비어있으면 미리보기에 noTitle 플레이스홀더가 표시된다', async () => {
      await renderAndWaitForLoad();

      // 기본 폼에는 제목이 없으므로 noTitle 표시
      expect(screen.getByText('common.noTitle')).toBeInTheDocument();
    });

    it('임베드 설명이 비어있으면 미리보기에 noDescription 플레이스홀더가 표시된다', async () => {
      await renderAndWaitForLoad();

      expect(screen.getByText('common.noDescription')).toBeInTheDocument();
    });

    it('HEX 코드 직접 입력 시 유효한 HEX 패턴만 허용된다', async () => {
      await renderAndWaitForLoad();

      const hexInput = screen.getByLabelText('common.embedColorHex');

      // onChange 핸들러가 정규식 패턴을 검사하므로 fireEvent.change로 직접 값을 설정한다
      // 유효한 HEX 값으로 변경
      fireEvent.change(hexInput, { target: { value: '#FF0000' } });
      expect(hexInput).toHaveValue('#FF0000');

      // 유효하지 않은 HEX 패턴(# 없음)은 state를 변경하지 않는다
      fireEvent.change(hexInput, { target: { value: 'FF0000' } });
      // # 없는 값은 패턴 검사 실패로 거부되어 이전 값 유지
      expect(hexInput).toHaveValue('#FF0000');
    });

    it('유효한 썸네일 URL 입력 시 미리보기에 이미지가 표시된다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      const urlInput = screen.getByLabelText('music.thumbnailUrl');
      await user.type(urlInput, 'https://example.com/image.png');

      // URL 입력이 반영됐는지 확인
      await waitFor(() => {
        expect(urlInput).toHaveValue('https://example.com/image.png');
      });

      // 유효한 URL이면 에러 메시지가 없고 미리보기에 img 태그가 렌더링된다
      expect(screen.queryByText('music.validationThumbnailUrl')).toBeNull();
      await waitFor(() => {
        const imgs = document.querySelectorAll('img[alt="thumbnail"]');
        expect(imgs.length).toBeGreaterThan(0);
        expect(imgs[0]).toHaveAttribute('src', 'https://example.com/image.png');
      });
    });

    it('유효하지 않은 썸네일 URL 입력 시 인라인 에러 메시지가 표시된다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      const urlInput = screen.getByLabelText('music.thumbnailUrl');
      await user.type(urlInput, 'not-a-valid-url');

      await waitFor(() => {
        expect(screen.getByText('music.validationThumbnailUrl')).toBeInTheDocument();
      });
    });

    it('유효하지 않은 URL을 유효한 URL로 수정하면 인라인 에러가 사라진다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      const urlInput = screen.getByLabelText('music.thumbnailUrl');

      // 잘못된 URL 입력
      await user.type(urlInput, 'not-valid');
      await waitFor(() => {
        expect(screen.getByText('music.validationThumbnailUrl')).toBeInTheDocument();
      });

      // 올바른 URL로 교체 (clear 후 재입력)
      await user.clear(urlInput);
      await user.type(urlInput, 'https://example.com/valid.png');

      await waitFor(() => {
        expect(screen.queryByText('music.validationThumbnailUrl')).toBeNull();
      });
    });
  });

  // ── 버튼 구성 설정 ──────────────────────────────────────────────────────

  describe('버튼 구성 설정', () => {
    it('버튼 비활성화 토글을 끄면 해당 버튼의 입력 필드가 disabled된다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      // search 버튼의 토글(기본 enabled=true)을 클릭하여 비활성화
      const searchToggle = getButtonToggle('music.buttonType_search');
      await user.click(searchToggle);

      expect(searchToggle).toHaveAttribute('aria-checked', 'false');

      // 비활성화된 버튼 카드 내의 textbox들이 disabled된다
      const searchCard = searchToggle.closest('div[class*="border"]') as HTMLElement;
      expect(searchCard).not.toBeNull();

      const inputs = within(searchCard).getAllByRole('textbox');
      inputs.forEach((input) => {
        expect(input).toBeDisabled();
      });
    });

    it('비활성화된 버튼을 다시 토글하면 활성화된다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      const searchToggle = getButtonToggle('music.buttonType_search');

      // 비활성화
      await user.click(searchToggle);
      await waitFor(() => {
        expect(searchToggle).toHaveAttribute('aria-checked', 'false');
      });

      // 재활성화
      await user.click(searchToggle);
      await waitFor(() => {
        expect(searchToggle).toHaveAttribute('aria-checked', 'true');
      });
    });

    it('버튼 라벨을 변경하면 해당 버튼의 라벨 입력값이 변경된다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      // search 버튼 라벨 입력 필드를 placeholder로 식별한다
      const labelInputs = screen.getAllByPlaceholderText('music.buttonType_search');
      const labelInput = labelInputs[0];

      await user.clear(labelInput);
      await user.type(labelInput, '노래 찾기');

      // 입력값이 반영됐는지 확인
      await waitFor(() => {
        expect(labelInput).toHaveValue('노래 찾기');
      });
    });

    it('버튼 Row 드롭다운을 변경하면 선택된 값이 반영된다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      // search 버튼 카드에서 Row 드롭다운을 찾는다
      const searchToggle = getButtonToggle('music.buttonType_search');
      const searchCard = searchToggle.closest('div[class*="border"]') as HTMLElement;

      const rowSelect = within(searchCard).getByRole('combobox');
      // Row 2 선택 (value=1 → 2번째 행)
      await user.selectOptions(rowSelect, '1');

      expect(rowSelect).toHaveValue('1');
    });

    it('활성화된 버튼들이 미리보기 패널에 렌더링된다', async () => {
      vi.mocked(musicConfigApi.fetchMusicConfig).mockResolvedValue(CONFIG_FIXTURE);

      await renderAndWaitForLoad();

      // 기본 버튼 라벨들이 미리보기에 표시된다
      expect(screen.getByText(/음악 검색하기/)).toBeInTheDocument();
      expect(screen.getByText(/일시정지\/재개/)).toBeInTheDocument();
    });
  });

  // ── 저장 동작 ────────────────────────────────────────────────────────────

  describe('저장 동작', () => {
    it('활성화 상태에서 채널 미선택 시 저장 버튼을 클릭하면 유효성 에러가 표시된다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      // 기본 상태: enabled=true, channelId='' → 유효성 실패 조건
      await user.click(screen.getByText('common.save'));

      await waitFor(() => {
        expect(screen.getByText('music.validationChannel')).toBeInTheDocument();
      });

      // saveMusicConfig API 호출이 발생하지 않아야 한다
      expect(vi.mocked(musicConfigApi.saveMusicConfig)).not.toHaveBeenCalled();
    });

    it('채널이 선택된 상태에서 저장하면 saveMusicConfig API가 호출된다', async () => {
      // 이미 채널이 선택된 설정으로 시작한다
      vi.mocked(musicConfigApi.fetchMusicConfig).mockResolvedValue(CONFIG_FIXTURE);

      const user = userEvent.setup();
      await renderAndWaitForLoad();

      await user.click(screen.getByText('common.save'));

      await waitFor(() => {
        expect(vi.mocked(musicConfigApi.saveMusicConfig)).toHaveBeenCalledWith(
          'guild-123',
          expect.objectContaining({ channelId: 'ch-001' }),
        );
      });
    });

    it('저장 성공 시 성공 메시지가 표시된다', async () => {
      vi.mocked(musicConfigApi.fetchMusicConfig).mockResolvedValue(CONFIG_FIXTURE);

      const user = userEvent.setup();
      await renderAndWaitForLoad();

      await user.click(screen.getByText('common.save'));

      await waitFor(() => {
        expect(screen.getByText('music.saveSuccess')).toBeInTheDocument();
      });
    });

    it('저장 API 실패 시 에러 메시지가 표시되고 폼 데이터는 유지된다', async () => {
      vi.mocked(musicConfigApi.fetchMusicConfig).mockResolvedValue(CONFIG_FIXTURE);
      vi.mocked(musicConfigApi.saveMusicConfig).mockRejectedValue(
        new Error('채널을 찾을 수 없습니다.'),
      );

      const user = userEvent.setup();
      await renderAndWaitForLoad();

      await user.click(screen.getByText('common.save'));

      await waitFor(() => {
        expect(screen.getByText('채널을 찾을 수 없습니다.')).toBeInTheDocument();
      });

      // 폼 데이터가 유지된다 (채널 ID가 그대로 남는다)
      expect(screen.getByLabelText('music.channelLabel')).toHaveValue('ch-001');
    });

    it('저장 성공 후 서버 응답값으로 폼이 업데이트된다', async () => {
      vi.mocked(musicConfigApi.fetchMusicConfig).mockResolvedValue(CONFIG_FIXTURE);
      const savedConfig: MusicChannelConfig = {
        ...CONFIG_FIXTURE,
        channelId: 'ch-002',
        embedTitle: '업데이트된 제목',
      };
      vi.mocked(musicConfigApi.saveMusicConfig).mockResolvedValue(savedConfig);

      const user = userEvent.setup();
      await renderAndWaitForLoad();

      await user.click(screen.getByText('common.save'));

      await waitFor(() => {
        // 서버 응답의 채널 ID와 제목이 폼에 반영된다
        expect(screen.getByLabelText('music.channelLabel')).toHaveValue('ch-002');
        expect(screen.getByLabelText('common.embedTitle')).toHaveValue('업데이트된 제목');
      });
    });

    it('비활성화(enabled=false) 상태에서는 채널 미선택이어도 유효성 통과 후 API를 호출한다', async () => {
      // enabled=false인 설정으로 시작한다 (채널 없음)
      vi.mocked(musicConfigApi.fetchMusicConfig).mockResolvedValue({
        ...CONFIG_FIXTURE,
        channelId: '',
        enabled: false,
      });

      const user = userEvent.setup();
      await renderAndWaitForLoad();

      // 채널 미선택 상태에서 저장
      await user.click(screen.getByText('common.save'));

      await waitFor(() => {
        expect(vi.mocked(musicConfigApi.saveMusicConfig)).toHaveBeenCalledWith(
          'guild-123',
          expect.objectContaining({ enabled: false }),
        );
      });

      // 채널 유효성 에러가 표시되지 않는다
      expect(screen.queryByText('music.validationChannel')).toBeNull();
    });

    it('유효하지 않은 썸네일 URL 상태에서 저장하면 URL 유효성 에러가 표시된다', async () => {
      vi.mocked(musicConfigApi.fetchMusicConfig).mockResolvedValue(CONFIG_FIXTURE);

      const user = userEvent.setup();
      await renderAndWaitForLoad();

      const urlInput = screen.getByLabelText('music.thumbnailUrl');
      await user.type(urlInput, 'invalid-url');

      await user.click(screen.getByText('common.save'));

      // 저장 클릭 시 saveError도 같은 메시지로 설정되어 화면에 두 개 표시될 수 있다
      await waitFor(() => {
        const errors = screen.getAllByText('music.validationThumbnailUrl');
        expect(errors.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('저장 요청 바디에 채널 ID, 임베드 설정, 버튼 구성, enabled가 포함된다', async () => {
      vi.mocked(musicConfigApi.fetchMusicConfig).mockResolvedValue(CONFIG_FIXTURE);

      const user = userEvent.setup();
      await renderAndWaitForLoad();

      const titleInput = screen.getByLabelText('common.embedTitle');
      await user.clear(titleInput);
      await user.type(titleInput, '내 플레이어');

      await user.click(screen.getByText('common.save'));

      await waitFor(() => {
        const callArgs = vi.mocked(musicConfigApi.saveMusicConfig).mock.calls[0];
        expect(callArgs[0]).toBe('guild-123');
        expect(callArgs[1]).toMatchObject({
          channelId: 'ch-001',
          embedTitle: '내 플레이어',
          enabled: true,
        });
        expect(Array.isArray(callArgs[1].buttons)).toBe(true);
      });
    });
  });

  // ── 기본설정 초기화 ─────────────────────────────────────────────────────

  describe('기본설정 초기화', () => {
    it('초기화 버튼 클릭 후 confirm 취소 시 API를 호출하지 않는다', async () => {
      const user = userEvent.setup();
      vi.spyOn(window, 'confirm').mockReturnValue(false);

      await renderAndWaitForLoad();

      await user.click(screen.getByText('music.resetButton'));

      expect(vi.mocked(musicConfigApi.resetMusicConfig)).not.toHaveBeenCalled();
    });

    it('초기화 버튼 클릭 후 confirm 확인 시 resetMusicConfig API가 호출된다', async () => {
      const user = userEvent.setup();
      vi.spyOn(window, 'confirm').mockReturnValue(true);

      await renderAndWaitForLoad();

      await user.click(screen.getByText('music.resetButton'));

      await waitFor(() => {
        expect(vi.mocked(musicConfigApi.resetMusicConfig)).toHaveBeenCalledWith('guild-123');
      });
    });

    it('초기화 성공 시 성공 메시지가 표시된다', async () => {
      const user = userEvent.setup();
      vi.spyOn(window, 'confirm').mockReturnValue(true);

      await renderAndWaitForLoad();

      await user.click(screen.getByText('music.resetButton'));

      await waitFor(() => {
        expect(screen.getByText('music.resetSuccess')).toBeInTheDocument();
      });
    });

    it('초기화 성공 시 서버 응답값으로 폼이 업데이트된다', async () => {
      const resetResult: MusicChannelConfig = {
        ...CONFIG_FIXTURE,
        embedTitle: null,
        embedDescription: null,
      };
      vi.mocked(musicConfigApi.resetMusicConfig).mockResolvedValue(resetResult);

      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const user = userEvent.setup();

      await renderAndWaitForLoad();

      await user.click(screen.getByText('music.resetButton'));

      await waitFor(() => {
        // 초기화 후 제목이 비워진다
        expect(screen.getByLabelText('common.embedTitle')).toHaveValue('');
      });
    });

    it('초기화 API 실패 시 에러 메시지가 표시된다', async () => {
      vi.mocked(musicConfigApi.resetMusicConfig).mockRejectedValue(
        new Error('초기화 중 오류가 발생했습니다.'),
      );

      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const user = userEvent.setup();

      await renderAndWaitForLoad();

      await user.click(screen.getByText('music.resetButton'));

      await waitFor(() => {
        expect(screen.getByText('초기화 중 오류가 발생했습니다.')).toBeInTheDocument();
      });
    });
  });

  // ── 채널 새로고침 ────────────────────────────────────────────────────────

  describe('채널 새로고침', () => {
    it('채널 새로고침 버튼 클릭 시 fetchGuildTextChannels를 재호출한다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      const initialCallCount = vi.mocked(discordApi.fetchGuildTextChannels).mock.calls.length;

      const refreshButton = screen.getByTitle('common.refreshChannels');
      await user.click(refreshButton);

      await waitFor(() => {
        expect(vi.mocked(discordApi.fetchGuildTextChannels).mock.calls.length).toBeGreaterThan(
          initialCallCount,
        );
      });
    });
  });
});
