import type { RolePanelDisabledReason } from '@onyu/shared';
import { useTranslations } from 'next-intl';

import type { AssignableRole } from '../../../../../lib/role-panel-api';

interface RolePickerProps {
  roles: AssignableRole[];
  value: string;
  onChange: (roleId: string) => void;
}

/** disabledReason → i18n 키 매핑 */
const DISABLED_REASON_KEY: Record<RolePanelDisabledReason, string> = {
  HIGHER_THAN_BOT: 'rolePanel.roleDisabledHigherThanBot',
  MANAGED: 'rolePanel.roleDisabledManaged',
  EVERYONE: 'rolePanel.roleDisabledEveryone',
  ADMINISTRATOR: 'rolePanel.roleDisabledAdministrator',
};

export function RolePicker({ roles, value, onChange }: RolePickerProps) {
  const t = useTranslations('settings');

  const selectedRole = roles.find((r) => r.id === value);
  const isSelectedUnavailable = selectedRole !== undefined && !selectedRole.assignable;

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {t('rolePanel.mappedRole')} <span className="text-red-500">*</span>
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        <option value="">{t('common.roleSelect')}</option>
        {roles.map((role) => {
          if (!role.assignable && role.disabledReason) {
            const reasonLabel = t(DISABLED_REASON_KEY[role.disabledReason]);
            return (
              <option key={role.id} value={role.id} disabled>
                {role.name} — {reasonLabel}
              </option>
            );
          }
          return (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          );
        })}
      </select>

      {/* 현재 선택값이 부여불가로 바뀐 경우 경고 표시 */}
      {isSelectedUnavailable && selectedRole.disabledReason && (
        <p className="mt-1 text-xs text-amber-600 font-medium">
          {t(DISABLED_REASON_KEY[selectedRole.disabledReason])}
        </p>
      )}

      {roles.length === 0 && <p className="mt-1 text-xs text-gray-400">{t('common.noRoles')}</p>}
    </div>
  );
}
