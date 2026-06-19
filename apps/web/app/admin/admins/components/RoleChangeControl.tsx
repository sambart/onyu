'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { AdminRole } from '@/app/lib/admin-api';

interface RoleChangeControlProps {
  discordUserId: string;
  currentRole: AdminRole;
  isLastSuperAdmin: boolean;
  isSubmitting: boolean;
  onChangeRole: (discordUserId: string, newRole: AdminRole) => void;
}

// eslint-disable-next-line max-lines-per-function -- 인라인 편집 상태(편집 전/편집 중/경고) 분기를 단일 컴포넌트로 통합
export default function RoleChangeControl({
  discordUserId,
  currentRole,
  isLastSuperAdmin,
  isSubmitting,
  onChangeRole,
}: RoleChangeControlProps) {
  const t = useTranslations('admin');
  const [selectedRole, setSelectedRole] = useState<AdminRole>(currentRole);
  const [isEditing, setIsEditing] = useState(false);

  const isDowngrading = currentRole === 'super_admin' && selectedRole === 'bot_operator';
  const showLastSuperAdminWarning = isLastSuperAdmin && isDowngrading;

  function handleOpenEdit() {
    setSelectedRole(currentRole);
    setIsEditing(true);
  }

  function handleCancelEdit() {
    setSelectedRole(currentRole);
    setIsEditing(false);
  }

  function handleSubmitChange() {
    if (selectedRole === currentRole) {
      setIsEditing(false);
      return;
    }
    onChangeRole(discordUserId, selectedRole);
    setIsEditing(false);
  }

  if (!isEditing) {
    return (
      <button
        type="button"
        onClick={handleOpenEdit}
        disabled={isSubmitting}
        className="text-sm font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50 transition-colors"
      >
        {t('admins.changeRole.action')}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <select
          value={selectedRole}
          onChange={(e) =>
            setSelectedRole(
              e.target.value as AdminRole /* select options가 AdminRole 값만 포함하므로 안전 */,
            )
          }
          disabled={isSubmitting}
          className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
        >
          <option value="super_admin">{t('admins.role.superAdmin')}</option>
          <option value="bot_operator">{t('admins.role.botOperator')}</option>
        </select>
        <button
          type="button"
          onClick={handleSubmitChange}
          disabled={isSubmitting}
          className="text-sm font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50 transition-colors"
        >
          {t('admins.add.submit')}
        </button>
        <button
          type="button"
          onClick={handleCancelEdit}
          disabled={isSubmitting}
          className="text-sm font-medium text-gray-500 hover:text-gray-700 disabled:opacity-50 transition-colors"
        >
          {t('admins.add.cancel')}
        </button>
      </div>
      {showLastSuperAdminWarning && (
        <p className="text-xs text-amber-600">{t('admins.constraint.lastSuperAdmin')}</p>
      )}
    </div>
  );
}
