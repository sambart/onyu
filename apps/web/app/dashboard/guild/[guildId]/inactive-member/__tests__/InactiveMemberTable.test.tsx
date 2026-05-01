/**
 * InactiveMemberTable 단위 테스트 (탭별 렌더링 검증)
 *
 * 유저 행동 관점에서 탭별 테이블 헤더·바디 분기를 검증한다.
 * - tab='all': 5개 컬럼(체크박스 포함 6) + 등급 배지
 * - tab='FULLY_INACTIVE': 미접속 일수 컬럼 + daysSince 계산
 * - tab='LOW_ACTIVE': 진척도 바 + lowActiveThresholdMin=undefined 시 '?' 표시
 * - tab='DECLINING': prev→current 표기, 감소율(%), 감소량
 * - prevTotalMinutes=0이면 감소율 '-' 표시
 * - 데이터 없을 때 빈 상태 메시지 표시
 *
 * next-intl은 키를 그대로 반환하는 stub으로 대체한다.
 * Card/CardContent는 실제 컴포넌트를 사용한다 (vitest.config.ts에 clsx alias 설정).
 *
 * 번역 stub 동작:
 *   STABLE_T(key)           → key (파라미터 없음)
 *   STABLE_T(key, params)   → key(JSON.stringify(params))
 *
 * gradeLabelI18n(grade, t) 는 t('inactive.grade.<shortKey>') 를 호출한다.
 *   FULLY_INACTIVE → 'inactive.grade.fullyInactive'
 *   LOW_ACTIVE     → 'inactive.grade.lowActive'
 *   DECLINING      → 'inactive.grade.declining'
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import InactiveMemberTable from '../components/InactiveMemberTable';
import type { InactiveMemberItem } from '@/app/lib/inactive-member-api';

// ─── 전역 모킹 ──────────────────────────────────────────────────────────────

const STABLE_T = (key: string, params?: Record<string, unknown>) => {
  if (params) return `${key}(${JSON.stringify(params)})`;
  return key;
};

vi.mock('next-intl', () => ({
  useTranslations: () => STABLE_T,
}));

// ─── 픽스처 ────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<InactiveMemberItem> = {}): InactiveMemberItem {
  return {
    userId: 'user-001',
    nickName: '테스트유저',
    grade: 'FULLY_INACTIVE',
    totalMinutes: 30,
    prevTotalMinutes: 100,
    lastVoiceDate: '2024-01-10',
    gradeChangedAt: '2024-01-15T00:00:00.000Z',
    classifiedAt: '2024-01-15T00:00:00.000Z',
    ...overrides,
  };
}

const DEFAULT_PROPS = {
  items: [makeItem()],
  selectedIds: new Set<string>(),
  onToggleSelect: vi.fn(),
  onToggleAll: vi.fn(),
};

// ─── 테스트 ─────────────────────────────────────────────────────────────────

describe('InactiveMemberTable', () => {
  // ── tab='all' ────────────────────────────────────────────────────────────

  describe("tab='all'", () => {
    it('닉네임/등급/마지막 음성/총 시간/등급 변경일 헤더 컬럼이 렌더링된다', () => {
      render(
        <InactiveMemberTable
          {...DEFAULT_PROPS}
          tab="all"
          items={[makeItem({ grade: 'DECLINING' })]}
        />,
      );

      expect(screen.getByText('inactive.table.nickname')).toBeInTheDocument();
      expect(screen.getByText('inactive.table.grade')).toBeInTheDocument();
      expect(screen.getByText('inactive.table.lastVoiceDate')).toBeInTheDocument();
      expect(screen.getByText('inactive.table.totalMinutes')).toBeInTheDocument();
      expect(screen.getByText('inactive.table.gradeChangedAt')).toBeInTheDocument();
    });

    it('FULLY_INACTIVE 등급 아이템에 등급 배지가 렌더링된다', () => {
      render(
        <InactiveMemberTable
          {...DEFAULT_PROPS}
          tab="all"
          items={[makeItem({ grade: 'FULLY_INACTIVE', nickName: '비활동유저' })]}
        />,
      );

      // gradeLabelI18n은 t('inactive.grade.fullyInactive') 를 호출한다
      // → stub이 키를 그대로 반환하므로 'inactive.grade.fullyInactive' 텍스트가 화면에 나타난다
      expect(screen.getByText('inactive.grade.fullyInactive')).toBeInTheDocument();
    });

    it('LOW_ACTIVE 등급 아이템에 등급 배지가 렌더링된다', () => {
      render(
        <InactiveMemberTable
          {...DEFAULT_PROPS}
          tab="all"
          items={[makeItem({ grade: 'LOW_ACTIVE' })]}
        />,
      );

      expect(screen.getByText('inactive.grade.lowActive')).toBeInTheDocument();
    });

    it('DECLINING 등급 아이템에 등급 배지가 렌더링된다', () => {
      render(
        <InactiveMemberTable
          {...DEFAULT_PROPS}
          tab="all"
          items={[makeItem({ grade: 'DECLINING' })]}
        />,
      );

      expect(screen.getByText('inactive.grade.declining')).toBeInTheDocument();
    });

    it('items가 빈 배열이면 noData 메시지가 표시된다', () => {
      render(<InactiveMemberTable {...DEFAULT_PROPS} tab="all" items={[]} />);

      expect(screen.getByText('inactive.table.noData')).toBeInTheDocument();
    });

    it('아이템이 있으면 닉네임이 렌더링된다', () => {
      render(
        <InactiveMemberTable
          {...DEFAULT_PROPS}
          tab="all"
          items={[makeItem({ nickName: '홍길동' })]}
        />,
      );

      expect(screen.getByText('홍길동')).toBeInTheDocument();
    });
  });

  // ── tab='FULLY_INACTIVE' ─────────────────────────────────────────────────

  describe("tab='FULLY_INACTIVE'", () => {
    it('닉네임/마지막 음성/미접속 일수/등급 변경일 헤더 컬럼이 렌더링된다', () => {
      render(<InactiveMemberTable {...DEFAULT_PROPS} tab="FULLY_INACTIVE" />);

      expect(screen.getByText('inactive.table.nickname')).toBeInTheDocument();
      expect(screen.getByText('inactive.table.lastVoiceDate')).toBeInTheDocument();
      expect(screen.getByText('inactive.table.daysAbsent')).toBeInTheDocument();
      expect(screen.getByText('inactive.table.gradeChangedAt')).toBeInTheDocument();
    });

    it('등급 컬럼과 totalMinutes 컬럼이 표시되지 않는다', () => {
      render(<InactiveMemberTable {...DEFAULT_PROPS} tab="FULLY_INACTIVE" />);

      expect(screen.queryByText('inactive.table.grade')).not.toBeInTheDocument();
      expect(screen.queryByText('inactive.table.totalMinutes')).not.toBeInTheDocument();
    });

    it('lastVoiceDate가 있으면 daysSince 계산 결과(daysAbsent 키)가 바디 셀에 렌더링된다', () => {
      // lastVoiceDate='2024-01-01'이면 과거 날짜이므로 days > 0
      render(
        <InactiveMemberTable
          {...DEFAULT_PROPS}
          tab="FULLY_INACTIVE"
          items={[makeItem({ lastVoiceDate: '2024-01-01' })]}
        />,
      );

      // 헤더 <th>와 데이터 <td> 모두 daysAbsent 텍스트를 포함할 수 있으므로 getAllByText 사용
      // 데이터 셀은 파라미터가 있는 형태: "inactive.table.daysAbsent({"days":N})"
      const daysElements = screen.getAllByText(/inactive\.table\.daysAbsent/);
      // 헤더(파라미터 없음)와 셀(파라미터 있음) 중 파라미터가 있는 것을 확인
      const dataCellText = daysElements.find((el) => el.textContent?.includes('"days"'));
      expect(dataCellText).toBeDefined();
      expect(dataCellText!.textContent).toMatch(/"days":\d+/);
    });

    it('lastVoiceDate가 null이면 noVoiceDate 키가 미접속 일수 셀에 표시된다', () => {
      render(
        <InactiveMemberTable
          {...DEFAULT_PROPS}
          tab="FULLY_INACTIVE"
          items={[makeItem({ lastVoiceDate: null })]}
        />,
      );

      // noVoiceDate 텍스트가 최소 1회 표시된다 (lastVoiceDate 셀 + daysAbsent 셀 모두)
      const noVoiceDateElements = screen.getAllByText('inactive.table.noVoiceDate');
      expect(noVoiceDateElements.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── tab='LOW_ACTIVE' ─────────────────────────────────────────────────────

  describe("tab='LOW_ACTIVE'", () => {
    it('닉네임/진척도/마지막 음성/등급 변경일 헤더 컬럼이 렌더링된다', () => {
      render(<InactiveMemberTable {...DEFAULT_PROPS} tab="LOW_ACTIVE" />);

      expect(screen.getByText('inactive.table.nickname')).toBeInTheDocument();
      expect(screen.getByText('inactive.table.thresholdProgress')).toBeInTheDocument();
      expect(screen.getByText('inactive.table.lastVoiceDate')).toBeInTheDocument();
      expect(screen.getByText('inactive.table.gradeChangedAt')).toBeInTheDocument();
    });

    it('lowActiveThresholdMin이 전달되면 progressbar role이 렌더링된다', () => {
      render(
        <InactiveMemberTable
          {...DEFAULT_PROPS}
          tab="LOW_ACTIVE"
          items={[makeItem({ totalMinutes: 40 })]}
          lowActiveThresholdMin={60}
        />,
      );

      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('lowActiveThresholdMin이 전달되면 aria-valuenow가 계산된 퍼센트 값으로 설정된다', () => {
      // totalMinutes=40, threshold=80 → 50%
      render(
        <InactiveMemberTable
          {...DEFAULT_PROPS}
          tab="LOW_ACTIVE"
          items={[makeItem({ totalMinutes: 40 })]}
          lowActiveThresholdMin={80}
        />,
      );

      const progressbar = screen.getByRole('progressbar');
      expect(progressbar).toHaveAttribute('aria-valuenow', '50');
    });

    it('lowActiveThresholdMin=undefined이면 데이터 셀에 "?" 가 표시된다', () => {
      render(
        <InactiveMemberTable
          {...DEFAULT_PROPS}
          tab="LOW_ACTIVE"
          items={[makeItem({ totalMinutes: 30 })]}
          // lowActiveThresholdMin 미전달
        />,
      );

      // 헤더(<th>)와 데이터(<td>) 모두 thresholdProgress 텍스트를 포함할 수 있으므로 getAllByText 사용
      // 데이터 셀은 파라미터가 있는 형태: "inactive.table.thresholdProgress({"current":30,"threshold":"?"})"
      const allElements = screen.getAllByText(/inactive\.table\.thresholdProgress/);
      const dataCellEl = allElements.find((el) => el.textContent?.includes('"threshold":"?"'));
      expect(dataCellEl).toBeDefined();
      expect(dataCellEl!.textContent).toContain('"threshold":"?"');
    });

    it('lowActiveThresholdMin=undefined이면 progressbar가 렌더링되지 않는다', () => {
      render(
        <InactiveMemberTable
          {...DEFAULT_PROPS}
          tab="LOW_ACTIVE"
          items={[makeItem({ totalMinutes: 30 })]}
        />,
      );

      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    it('totalMinutes가 threshold를 초과해도 progressbar의 aria-valuenow는 100을 넘지 않는다', () => {
      // totalMinutes=150, threshold=100 → clamp 100
      render(
        <InactiveMemberTable
          {...DEFAULT_PROPS}
          tab="LOW_ACTIVE"
          items={[makeItem({ totalMinutes: 150 })]}
          lowActiveThresholdMin={100}
        />,
      );

      const progressbar = screen.getByRole('progressbar');
      expect(progressbar).toHaveAttribute('aria-valuenow', '100');
    });
  });

  // ── tab='DECLINING' ──────────────────────────────────────────────────────

  describe("tab='DECLINING'", () => {
    it('닉네임/prev→current/감소율/감소량/마지막 음성/등급 변경일 헤더 컬럼이 렌더링된다', () => {
      render(<InactiveMemberTable {...DEFAULT_PROPS} tab="DECLINING" />);

      expect(screen.getByText('inactive.table.nickname')).toBeInTheDocument();
      expect(screen.getByText('inactive.table.prevTotalMinutes')).toBeInTheDocument();
      expect(screen.getByText('inactive.table.decreaseRate')).toBeInTheDocument();
      expect(screen.getByText('inactive.table.decreaseAmount')).toBeInTheDocument();
      expect(screen.getByText('inactive.table.lastVoiceDate')).toBeInTheDocument();
      expect(screen.getByText('inactive.table.gradeChangedAt')).toBeInTheDocument();
    });

    it('prevTotalMinutes와 totalMinutes를 prevTotalMinutes 키로 렌더링한다', () => {
      render(
        <InactiveMemberTable
          {...DEFAULT_PROPS}
          tab="DECLINING"
          items={[makeItem({ prevTotalMinutes: 100, totalMinutes: 60 })]}
        />,
      );

      // t("inactive.table.prevTotalMinutes", { prev: 100, current: 60 })
      // → "inactive.table.prevTotalMinutes({"prev":100,"current":60})"
      const prevText = screen.getByText(/inactive\.table\.prevTotalMinutes\(/);
      expect(prevText.textContent).toContain('"prev":100');
      expect(prevText.textContent).toContain('"current":60');
    });

    it('감소율이 올바르게 계산되어 표시된다 — prev=100, current=60이면 40%', () => {
      render(
        <InactiveMemberTable
          {...DEFAULT_PROPS}
          tab="DECLINING"
          items={[makeItem({ prevTotalMinutes: 100, totalMinutes: 60 })]}
        />,
      );

      expect(screen.getByText('40%')).toBeInTheDocument();
    });

    it('prevTotalMinutes=0이면 감소율 셀에 "-"가 표시된다', () => {
      render(
        <InactiveMemberTable
          {...DEFAULT_PROPS}
          tab="DECLINING"
          items={[makeItem({ prevTotalMinutes: 0, totalMinutes: 30 })]}
        />,
      );

      expect(screen.getByText('-')).toBeInTheDocument();
    });

    it('감소량이 올바르게 계산되어 렌더링된다 — prev=100, current=60이면 amount=40', () => {
      render(
        <InactiveMemberTable
          {...DEFAULT_PROPS}
          tab="DECLINING"
          items={[makeItem({ prevTotalMinutes: 100, totalMinutes: 60 })]}
        />,
      );

      // 헤더(<th>)와 데이터(<td>) 모두 decreaseAmount 텍스트를 포함할 수 있으므로 getAllByText 사용
      // 데이터 셀은 파라미터가 있는 형태: "inactive.table.decreaseAmount({"minutes":40})"
      const allElements = screen.getAllByText(/inactive\.table\.decreaseAmount/);
      const dataCellEl = allElements.find((el) => el.textContent?.includes('"minutes"'));
      expect(dataCellEl).toBeDefined();
      expect(dataCellEl!.textContent).toContain('"minutes":40');
    });

    it('current > prev이면 감소량은 0으로 clamp되어 표시된다', () => {
      render(
        <InactiveMemberTable
          {...DEFAULT_PROPS}
          tab="DECLINING"
          items={[makeItem({ prevTotalMinutes: 50, totalMinutes: 80 })]}
        />,
      );

      const allElements = screen.getAllByText(/inactive\.table\.decreaseAmount/);
      const dataCellEl = allElements.find((el) => el.textContent?.includes('"minutes"'));
      expect(dataCellEl).toBeDefined();
      expect(dataCellEl!.textContent).toContain('"minutes":0');
    });
  });

  // ── 선택 체크박스 ────────────────────────────────────────────────────────

  describe('선택 체크박스', () => {
    it('전체 선택 체크박스가 렌더링된다', () => {
      render(<InactiveMemberTable {...DEFAULT_PROPS} tab="all" />);

      const selectAllCheckbox = screen.getByLabelText('inactive.table.selectAll');
      expect(selectAllCheckbox).toBeInTheDocument();
    });

    it('items가 비어있으면 전체 선택 체크박스가 unchecked 상태이다', () => {
      render(<InactiveMemberTable {...DEFAULT_PROPS} tab="all" items={[]} />);

      const selectAllCheckbox = screen.getByLabelText('inactive.table.selectAll');
      expect(selectAllCheckbox).not.toBeChecked();
    });

    it('모든 아이템이 selectedIds에 포함되면 전체 선택 체크박스가 checked 상태이다', () => {
      const items = [makeItem({ userId: 'user-001' })];
      render(
        <InactiveMemberTable
          {...DEFAULT_PROPS}
          tab="all"
          items={items}
          selectedIds={new Set(['user-001'])}
        />,
      );

      const selectAllCheckbox = screen.getByLabelText('inactive.table.selectAll');
      expect(selectAllCheckbox).toBeChecked();
    });

    it('행 체크박스 클릭 시 onToggleSelect(userId)가 호출된다', async () => {
      const user = userEvent.setup();
      const handleToggleSelect = vi.fn();

      render(
        <InactiveMemberTable
          {...DEFAULT_PROPS}
          tab="all"
          items={[makeItem({ userId: 'user-999', nickName: '선택유저' })]}
          onToggleSelect={handleToggleSelect}
        />,
      );

      const rowCheckbox = screen.getByLabelText('선택유저');
      await user.click(rowCheckbox);

      expect(handleToggleSelect).toHaveBeenCalledWith('user-999');
    });

    it('전체 선택 체크박스 클릭 시 onToggleAll(true)가 호출된다', async () => {
      const user = userEvent.setup();
      const handleToggleAll = vi.fn();

      render(
        <InactiveMemberTable
          {...DEFAULT_PROPS}
          tab="all"
          items={[makeItem()]}
          onToggleAll={handleToggleAll}
        />,
      );

      const selectAllCheckbox = screen.getByLabelText('inactive.table.selectAll');
      await user.click(selectAllCheckbox);

      expect(handleToggleAll).toHaveBeenCalledWith(true);
    });
  });
});
