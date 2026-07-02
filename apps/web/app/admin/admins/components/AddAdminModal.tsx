'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { AdminRole } from '@/app/lib/admin-api';

interface AddAdminModalProps {
  isOpen: boolean;
  isSubmitting: boolean;
  onSubmit: (discordUserId: string, role: AdminRole) => void;
  onCancel: () => void;
}

export default function AddAdminModal({
  isOpen,
  isSubmitting,
  onSubmit,
  onCancel,
}: AddAdminModalProps) {
  const t = useTranslations('admin');
  const [discordUserId, setDiscordUserId] = useState('');
  const [role, setRole] = useState<AdminRole>('bot_operator');
  const [validationError, setValidationError] = useState<string | null>(null);

  function handleSubmit() {
    const trimmedId = discordUserId.trim();
    if (!trimmedId) {
      setValidationError(t('admins.add.discordIdRequired'));
      return;
    }
    setValidationError(null);
    onSubmit(trimmedId, role);
  }

  function handleCancel() {
    setDiscordUserId('');
    setRole('bot_operator');
    setValidationError(null);
    onCancel();
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-4">{t('admins.add.title')}</h3>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="discord-user-id"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              {t('admins.add.discordIdLabel')}
            </label>
            <input
              id="discord-user-id"
              type="text"
              value={discordUserId}
              onChange={(e) => {
                setDiscordUserId(e.target.value);
                if (validationError) setValidationError(null);
              }}
              disabled={isSubmitting}
              placeholder="000000000000000000"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 font-mono"
            />
            {validationError && <p className="mt-1 text-xs text-red-600">{validationError}</p>}
          </div>

          <div>
            <label htmlFor="admin-role" className="block text-sm font-medium text-gray-700 mb-1">
              {t('admins.add.roleLabel')}
            </label>
            <select
              id="admin-role"
              value={role}
              onChange={(e) =>
                setRole(
                  e.target.value as AdminRole /* select options가 AdminRole 값만 포함하므로 안전 */,
                )
              }
              disabled={isSubmitting}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              <option value="bot_operator">{t('admins.role.botOperator')}</option>
              <option value="super_admin">{t('admins.role.superAdmin')}</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end space-x-3 mt-6">
          <button
            type="button"
            onClick={handleCancel}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {t('admins.add.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? t('loading') : t('admins.add.submit')}
          </button>
        </div>
      </div>
    </div>
  );
}
