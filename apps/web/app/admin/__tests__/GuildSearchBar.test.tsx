/**
 * GuildSearchBar 단위 테스트
 *
 * 유저 관점 검증 항목:
 * - 입력 필드가 렌더링된다
 * - 사용자가 텍스트를 입력하면 onChange 콜백이 입력값으로 호출된다
 * - value prop 이 입력 필드에 반영된다
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('lucide-react', () => ({
  Search: () => <svg data-testid="search-icon" />,
}));

import GuildSearchBar from '../components/GuildSearchBar';

describe('GuildSearchBar — 검색 입력 컴포넌트', () => {
  it('텍스트 입력 필드가 렌더링된다', () => {
    render(<GuildSearchBar value="" onChange={vi.fn()} />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('value prop 이 입력 필드에 표시된다', () => {
    render(<GuildSearchBar value="알파 서버" onChange={vi.fn()} />);
    expect(screen.getByRole('textbox')).toHaveValue('알파 서버');
  });

  it('사용자가 텍스트를 입력하면 onChange 가 호출된다', async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    render(<GuildSearchBar value="" onChange={handleChange} />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'abc');

    // controlled input: userEvent.type 은 글자마다 onChange 호출
    // 'a', 'b', 'c' 순서로 각 단일 문자가 인자로 전달된다
    expect(handleChange).toHaveBeenCalledTimes(3);
    expect(handleChange).toHaveBeenNthCalledWith(1, 'a');
    expect(handleChange).toHaveBeenNthCalledWith(2, 'b');
    expect(handleChange).toHaveBeenNthCalledWith(3, 'c');
  });
});
