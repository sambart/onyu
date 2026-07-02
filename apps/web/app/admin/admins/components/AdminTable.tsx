'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';

import type { AdminRole, AdminUser } from '@/app/lib/admin-api';
import { formatDate } from '@/app/lib/format-utils';

import DeactivateConfirmDialog from './DeactivateConfirmDialog';
import RoleBadge from './RoleBadge';
import RoleChangeControl from './RoleChangeControl';

interface AdminRowProps {
  admin: AdminUser;
  currentUserDiscordId: string;
  isLastActiveSuperAdmin: boolean;
  isSubmitting: boolean;
  onChangeRole: (discordUserId: string, newRole: AdminRole) => void;
  onDeactivate: (discordUserId: string) => void;
}

function AdminRow({
  admin,
  currentUserDiscordId,
  isLastActiveSuperAdmin,
  isSubmitting,
  onChangeRole,
  onDeactivate,
}: AdminRowProps) {
  const t = useTranslations('admin');
  const locale = useLocale();
  const [isDeactivateDialogOpen, setIsDeactivateDialogOpen] = useState(false);

  const isSelf = admin.discordUserId === currentUserDiscordId;
  const isLastSuperAdmin = isLastActiveSuperAdmin && admin.role === 'super_admin';

  const canDeactivate = !isSelf && admin.isActive;
  const deactivateTooltip = isSelf ? t('admins.constraint.selfDeactivate') : undefined;

  function handleDeactivateClick() {
    setIsDeactivateDialogOpen(true);
  }

  function handleDeactivateConfirm() {
    setIsDeactivateDialogOpen(false);
    onDeactivate(admin.discordUserId);
  }

  function handleDeactivateCancel() {
    setIsDeactivateDialogOpen(false);
  }

  return (
    <>
      <tr className="hover:bg-gray-50 transition-colors">
        <td className="px-4 py-3 whitespace-nowrap">
          <span className="text-sm font-mono text-gray-800">{admin.discordUserId}</span>
          {isSelf && <span className="ml-2 text-xs text-indigo-500 font-medium">(나)</span>}
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          <RoleBadge role={admin.role} />
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          <span className="text-sm text-gray-600">{admin.grantedBy ?? '—'}</span>
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
              admin.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {admin.isActive ? t('admins.status.active') : t('admins.status.inactive')}
          </span>
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          <span className="text-sm text-gray-500">{formatDate(admin.createdAt, locale)}</span>
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          <div className="flex items-center gap-3">
            {admin.isActive && (
              <RoleChangeControl
                discordUserId={admin.discordUserId}
                currentRole={admin.role}
                isLastSuperAdmin={isLastSuperAdmin}
                isSubmitting={isSubmitting}
                onChangeRole={onChangeRole}
              />
            )}
            <span title={deactivateTooltip}>
              <button
                type="button"
                onClick={handleDeactivateClick}
                disabled={!canDeactivate || isSubmitting}
                className="text-sm font-medium text-red-600 hover:text-red-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {t('admins.deactivate.action')}
              </button>
            </span>
          </div>
        </td>
      </tr>
      <DeactivateConfirmDialog
        discordUserId={admin.discordUserId}
        isOpen={isDeactivateDialogOpen}
        isSubmitting={isSubmitting}
        onConfirm={handleDeactivateConfirm}
        onCancel={handleDeactivateCancel}
      />
    </>
  );
}

interface AdminTableProps {
  admins: AdminUser[];
  currentUserDiscordId: string;
  isSubmitting: boolean;
  onChangeRole: (discordUserId: string, newRole: AdminRole) => void;
  onDeactivate: (discordUserId: string) => void;
}

export default function AdminTable({
  admins,
  currentUserDiscordId,
  isSubmitting,
  onChangeRole,
  onDeactivate,
}: AdminTableProps) {
  const t = useTranslations('admin');

  const activeSuperAdminCount = admins.filter((a) => a.role === 'super_admin' && a.isActive).length;
  const isLastActiveSuperAdmin = activeSuperAdminCount <= 1;

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {(
              [
                'colDiscordId',
                'colRole',
                'colGrantedBy',
                'colStatus',
                'colCreatedAt',
                'colAction',
              ] as const
            ).map((col) => (
              <th
                key={col}
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                {t(`admins.${col}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {admins.map((admin) => (
            <AdminRow
              key={admin.discordUserId}
              admin={admin}
              currentUserDiscordId={currentUserDiscordId}
              isLastActiveSuperAdmin={isLastActiveSuperAdmin}
              isSubmitting={isSubmitting}
              onChangeRole={onChangeRole}
              onDeactivate={onDeactivate}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
