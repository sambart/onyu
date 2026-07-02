/**
 * RoleBadge 컴포넌트 단위 테스트
 *
 * 유저 관점 검증 항목:
 * - role='super_admin' 이면 superAdmin 라벨이 렌더링된다
 * - role='bot_operator' 이면 botOperator 라벨이 렌더링된다
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

import RoleBadge from '../components/RoleBadge';

describe('RoleBadge', () => {
  it('role="super_admin" 이면 superAdmin 라벨이 렌더링된다', () => {
    render(<RoleBadge role="super_admin" />);
    expect(screen.getByText('admins.role.superAdmin')).toBeInTheDocument();
  });

  it('role="bot_operator" 이면 botOperator 라벨이 렌더링된다', () => {
    render(<RoleBadge role="bot_operator" />);
    expect(screen.getByText('admins.role.botOperator')).toBeInTheDocument();
  });
});
