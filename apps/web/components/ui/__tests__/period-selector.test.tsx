/**
 * period-selector.tsx (PeriodSelector) 단위 테스트
 *
 * 검증 항목:
 * - options가 각각 버튼으로 렌더링된다
 * - 선택된 값에 aria-pressed=true가 반영된다
 * - 버튼 클릭 시 onChange(value)가 호출된다
 * - 문자열/숫자 제네릭 값 모두 지원한다
 * - role=group 컨테이너가 렌더링된다
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PeriodSelector } from '../period-selector';

describe('PeriodSelector', () => {
  it('숫자 값 옵션들이 각각 버튼으로 렌더링된다', () => {
    render(
      <PeriodSelector
        options={[
          { value: 7, label: '7일' },
          { value: 30, label: '30일' },
        ]}
        value={7}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '7일' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '30일' })).toBeInTheDocument();
  });

  it('현재 선택된 값의 버튼에 aria-pressed=true가 설정된다', () => {
    render(
      <PeriodSelector
        options={[
          { value: 7, label: '7일' },
          { value: 30, label: '30일' },
        ]}
        value={30}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '7일' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: '30일' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('버튼 클릭 시 onChange가 해당 옵션의 value와 함께 호출된다', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <PeriodSelector
        options={[
          { value: 7, label: '7일' },
          { value: 30, label: '30일' },
        ]}
        value={7}
        onChange={handleChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: '30일' }));

    expect(handleChange).toHaveBeenCalledWith(30);
  });

  it('문자열 제네릭 값도 지원한다', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <PeriodSelector
        options={[
          { value: '7d', label: '최근 7일' },
          { value: '30d', label: '최근 30일' },
        ]}
        value="7d"
        onChange={handleChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: '최근 30일' }));

    expect(handleChange).toHaveBeenCalledWith('30d');
  });

  it('role=group 컨테이너가 렌더링되고 ariaLabel이 반영된다', () => {
    render(
      <PeriodSelector
        options={[{ value: 7, label: '7일' }]}
        value={7}
        onChange={vi.fn()}
        ariaLabel="기간 선택"
      />,
    );

    expect(screen.getByRole('group', { name: '기간 선택' })).toBeInTheDocument();
  });

  it('키보드로 탭 이동 후 Enter를 누르면 onChange가 호출된다 (버튼 기본 접근성)', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <PeriodSelector
        options={[
          { value: 7, label: '7일' },
          { value: 30, label: '30일' },
        ]}
        value={7}
        onChange={handleChange}
      />,
    );

    await user.tab();
    expect(screen.getByRole('button', { name: '7일' })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('button', { name: '30일' })).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(handleChange).toHaveBeenCalledWith(30);
  });

  it('키보드로 포커스된 버튼에서 Space를 누르면 onChange가 호출된다', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <PeriodSelector
        options={[
          { value: 7, label: '7일' },
          { value: 30, label: '30일' },
        ]}
        value={7}
        onChange={handleChange}
      />,
    );

    await user.tab();
    await user.tab();
    expect(screen.getByRole('button', { name: '30일' })).toHaveFocus();

    await user.keyboard(' ');
    expect(handleChange).toHaveBeenCalledWith(30);
  });
});
