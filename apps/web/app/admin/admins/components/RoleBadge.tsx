'use client';

import { useTranslations } from 'next-intl';

import type { AdminRole } from '@/app/lib/admin-api';

const ROLE_CLASS: Record<AdminRole, string> = {
  super_admin: 'bg-indigo-100 text-indigo-800',
  bot_operator: 'bg-green-100 text-green-800',
};

interface RoleBadgeProps {
  role: AdminRole;
}

export default function RoleBadge({ role }: RoleBadgeProps) {
  const t = useTranslations('admin');
  const label = role === 'super_admin' ? t('admins.role.superAdmin') : t('admins.role.botOperator');

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${ROLE_CLASS[role]}`}
    >
      {label}
    </span>
  );
}
