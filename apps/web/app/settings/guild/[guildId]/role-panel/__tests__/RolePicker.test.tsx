import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { AssignableRole } from '../../../../../lib/role-panel-api';
import { RolePicker } from '../components/RolePicker';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const ASSIGNABLE_ROLES: AssignableRole[] = [
  { id: 'r1', name: '게이머', color: 0, position: 1, assignable: true, disabledReason: null },
  { id: 'r2', name: '스태프', color: 0, position: 2, assignable: true, disabledReason: null },
];

const DISABLED_ROLES: AssignableRole[] = [
  {
    id: 'r3',
    name: '봇역할',
    color: 0,
    position: 10,
    assignable: false,
    disabledReason: 'HIGHER_THAN_BOT',
  },
  {
    id: 'r4',
    name: '연동역할',
    color: 0,
    position: 3,
    assignable: false,
    disabledReason: 'MANAGED',
  },
  {
    id: 'r5',
    name: '@everyone',
    color: 0,
    position: 0,
    assignable: false,
    disabledReason: 'EVERYONE',
  },
  {
    id: 'r6',
    name: '관리자역할',
    color: 0,
    position: 5,
    assignable: false,
    disabledReason: 'ADMINISTRATOR',
  },
];

describe('RolePicker', () => {
  describe('assignable=true 역할', () => {
    it('assignable 역할은 disabled 없이 선택 가능하다', () => {
      render(<RolePicker roles={ASSIGNABLE_ROLES} value="" onChange={vi.fn()} />);

      const options = screen.getAllByRole('option');
      const gameOption = options.find((o) => o.textContent === '게이머');
      expect(gameOption).toBeDefined();
      expect(gameOption).not.toBeDisabled();
    });

    it('역할 선택 시 onChange가 roleId로 호출된다', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      render(<RolePicker roles={ASSIGNABLE_ROLES} value="" onChange={handleChange} />);

      await user.selectOptions(screen.getByRole('combobox'), 'r1');

      expect(handleChange).toHaveBeenCalledWith('r1');
    });
  });

  describe('disabledReason별 비활성 처리', () => {
    it('HIGHER_THAN_BOT 역할은 disabled이고 사유 텍스트를 포함한다', () => {
      render(<RolePicker roles={DISABLED_ROLES} value="" onChange={vi.fn()} />);

      const options = screen.getAllByRole('option');
      const higherOption = options.find((o) => o.textContent?.includes('봇역할'));
      expect(higherOption).toBeDefined();
      expect(higherOption).toBeDisabled();
      expect(higherOption?.textContent).toContain('rolePanel.roleDisabledHigherThanBot');
    });

    it('MANAGED 역할은 disabled이고 사유 텍스트를 포함한다', () => {
      render(<RolePicker roles={DISABLED_ROLES} value="" onChange={vi.fn()} />);

      const options = screen.getAllByRole('option');
      const managedOption = options.find((o) => o.textContent?.includes('연동역할'));
      expect(managedOption).toBeDefined();
      expect(managedOption).toBeDisabled();
      expect(managedOption?.textContent).toContain('rolePanel.roleDisabledManaged');
    });

    it('EVERYONE 역할은 disabled이고 사유 텍스트를 포함한다', () => {
      render(<RolePicker roles={DISABLED_ROLES} value="" onChange={vi.fn()} />);

      const options = screen.getAllByRole('option');
      const everyoneOption = options.find((o) => o.textContent?.includes('@everyone'));
      expect(everyoneOption).toBeDefined();
      expect(everyoneOption).toBeDisabled();
      expect(everyoneOption?.textContent).toContain('rolePanel.roleDisabledEveryone');
    });

    it('ADMINISTRATOR 역할은 disabled이고 사유 텍스트를 포함한다', () => {
      render(<RolePicker roles={DISABLED_ROLES} value="" onChange={vi.fn()} />);

      const options = screen.getAllByRole('option');
      const adminOption = options.find((o) => o.textContent?.includes('관리자역할'));
      expect(adminOption).toBeDefined();
      expect(adminOption).toBeDisabled();
      expect(adminOption?.textContent).toContain('rolePanel.roleDisabledAdministrator');
    });
  });

  describe('기존 선택값이 부여불가로 바뀐 경우', () => {
    it('현재 선택된 역할이 assignable=false이면 경고 메시지가 표시된다', () => {
      const stalRole: AssignableRole = {
        id: 'r7',
        name: '변경역할',
        color: 0,
        position: 8,
        assignable: false,
        disabledReason: 'HIGHER_THAN_BOT',
      };

      render(<RolePicker roles={[stalRole, ...ASSIGNABLE_ROLES]} value="r7" onChange={vi.fn()} />);

      expect(screen.getByText('rolePanel.roleDisabledHigherThanBot')).toBeInTheDocument();
    });

    it('현재 선택된 역할이 assignable=true이면 경고 메시지가 표시되지 않는다', () => {
      render(<RolePicker roles={ASSIGNABLE_ROLES} value="r1" onChange={vi.fn()} />);

      expect(screen.queryByText('rolePanel.roleDisabledHigherThanBot')).not.toBeInTheDocument();
    });
  });

  describe('역할 목록이 비어있는 경우', () => {
    it('역할이 없으면 noRoles 메시지를 표시한다', () => {
      render(<RolePicker roles={[]} value="" onChange={vi.fn()} />);

      expect(screen.getByText('common.noRoles')).toBeInTheDocument();
    });
  });
});
