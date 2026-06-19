'use client';

import { useTranslations } from 'next-intl';

interface DeactivateConfirmDialogProps {
  discordUserId: string;
  isOpen: boolean;
  isSubmitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DeactivateConfirmDialog({
  discordUserId,
  isOpen,
  isSubmitting,
  onConfirm,
  onCancel,
}: DeactivateConfirmDialogProps) {
  const t = useTranslations('admin');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl max-w-sm w-full mx-4 p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-2">
          {t('admins.deactivate.confirmTitle')}
        </h3>
        <p className="text-sm text-gray-600 mb-1">{t('admins.deactivate.confirm')}</p>
        <p className="text-sm font-mono text-gray-800 bg-gray-50 rounded px-2 py-1 mb-5 break-all">
          {discordUserId}
        </p>
        <div className="flex justify-end space-x-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {t('admins.deactivate.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? t('loading') : t('admins.deactivate.action')}
          </button>
        </div>
      </div>
    </div>
  );
}
