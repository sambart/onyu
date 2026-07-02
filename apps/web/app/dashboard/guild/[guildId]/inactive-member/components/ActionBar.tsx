'use client';

import { LogOut, MessageSquare, UserMinus, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';

import type { ActionType } from '@/app/lib/inactive-member-api';

interface Props {
  selectedCount: number;
  isActing: boolean;
  onAction: (actionType: ActionType) => void;
}

export default function ActionBar({ selectedCount, isActing, onAction }: Props) {
  const t = useTranslations('dashboard');

  // The confirm text is intentionally kept as a fixed Korean string (the user must type exactly this)
  const KICK_CONFIRM_TEXT = t('inactive.action.kickModal.confirmText');

  const isDisabled = selectedCount === 0 || isActing;

  const [isKickModalOpen, setIsKickModalOpen] = useState(false);
  const [kickConfirmInput, setKickConfirmInput] = useState('');

  const handleKickClick = useCallback(() => {
    setIsKickModalOpen(true);
    setKickConfirmInput('');
  }, []);

  const handleKickConfirm = useCallback(() => {
    if (kickConfirmInput !== KICK_CONFIRM_TEXT) return;
    setIsKickModalOpen(false);
    setKickConfirmInput('');
    onAction('ACTION_KICK');
  }, [kickConfirmInput, KICK_CONFIRM_TEXT, onAction]);

  const handleKickCancel = useCallback(() => {
    setIsKickModalOpen(false);
    setKickConfirmInput('');
  }, []);

  return (
    <>
      <div className="rounded-lg border bg-card p-3 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">
          {selectedCount > 0 ? (
            <span className="font-medium text-foreground">
              {selectedCount}
              {t('common.unit.person')}
            </span>
          ) : (
            `0${t('common.unit.person')}`
          )}{' '}
          {t('inactive.action.selected')}
        </span>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => onAction('ACTION_DM')}
            disabled={isDisabled}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <MessageSquare className="w-4 h-4" />
            {t('inactive.action.dm')}
          </button>

          <button
            type="button"
            onClick={() => onAction('ACTION_ROLE_ADD')}
            disabled={isDisabled}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            {t('inactive.action.roleAdd')}
          </button>

          <button
            type="button"
            onClick={() => onAction('ACTION_ROLE_REMOVE')}
            disabled={isDisabled}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <UserMinus className="w-4 h-4" />
            {t('inactive.action.roleRemove')}
          </button>

          <button
            type="button"
            onClick={handleKickClick}
            disabled={isDisabled}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-800 text-white text-sm font-medium hover:bg-red-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <LogOut className="w-4 h-4" />
            {t('inactive.action.kick')}
          </button>
        </div>
      </div>

      {isKickModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-gray-900">
            <h2 className="text-lg font-bold text-red-700 dark:text-red-400">
              {t('inactive.action.kickModal.title')}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t('inactive.action.kickModal.description', { count: selectedCount })}
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              {t('inactive.action.kickModal.inputHint', { text: KICK_CONFIRM_TEXT })}
            </p>
            <input
              type="text"
              value={kickConfirmInput}
              onChange={(e) => setKickConfirmInput(e.target.value)}
              placeholder={KICK_CONFIRM_TEXT}
              className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-700 dark:bg-gray-800"
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={handleKickCancel}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800 transition-colors"
              >
                {t('inactive.action.kickModal.cancel')}
              </button>
              <button
                type="button"
                onClick={handleKickConfirm}
                disabled={kickConfirmInput !== KICK_CONFIRM_TEXT}
                className="px-4 py-2 rounded-lg bg-red-700 text-white text-sm font-medium hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {t('inactive.action.kickModal.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
