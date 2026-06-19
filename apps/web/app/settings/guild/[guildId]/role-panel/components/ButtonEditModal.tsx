import { type RolePanelButtonMode, type RolePanelButtonStyle } from '@onyu/shared';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import GuildEmojiPicker from '../../../../../components/GuildEmojiPicker';
import type { DiscordEmoji } from '../../../../../lib/discord-api';
import type { AssignableRole } from '../../../../../lib/role-panel-api';
import type { ButtonForm } from '../types';
import { EMPTY_BUTTON, MAX_LABEL_LEN } from '../types';
import { ModeSelector } from './ModeSelector';
import { RolePicker } from './RolePicker';
import { StyleSelector } from './StyleSelector';

interface ButtonEditModalProps {
  isOpen: boolean;
  button: ButtonForm | null;
  roles: AssignableRole[];
  emojis: DiscordEmoji[];
  onSave: (button: ButtonForm) => void;
  onClose: () => void;
}

function ButtonEditModalInner({
  button,
  roles,
  emojis,
  onSave,
  onClose,
}: Omit<ButtonEditModalProps, 'isOpen'>) {
  const t = useTranslations('settings');
  const [draft, setDraft] = useState<ButtonForm>(button ? { ...button } : { ...EMPTY_BUTTON });

  function updateDraft(partial: Partial<ButtonForm>) {
    setDraft((prev) => ({ ...prev, ...partial }));
  }

  function handleRoleChange(roleId: string) {
    const found = roles.find((r) => r.id === roleId);
    updateDraft({ roleId, roleName: found?.name ?? '' });
  }

  function handleModeChange(mode: RolePanelButtonMode) {
    updateDraft({ mode });
  }

  function handleStyleChange(style: RolePanelButtonStyle) {
    updateDraft({ style });
  }

  function handleSave() {
    onSave(draft);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-16 px-4">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[80vh] overflow-y-auto shadow-xl">
        {/* 모달 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">
            {button === null ? t('rolePanel.addButton') : t('rolePanel.editButton')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('rolePanel.modalCancel')}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 모달 본체 */}
        <div className="px-6 py-4 space-y-4">
          {/* 라벨 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('rolePanel.buttonLabel')} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={draft.label}
              onChange={(e) => updateDraft({ label: e.target.value })}
              placeholder={t('rolePanel.buttonLabelPlaceholder')}
              maxLength={MAX_LABEL_LEN}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              {draft.label.length} / {MAX_LABEL_LEN}
            </p>
          </div>

          {/* 이모지 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('rolePanel.buttonEmoji')}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={draft.emoji}
                onChange={(e) => updateDraft({ emoji: e.target.value })}
                placeholder="🎮"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <GuildEmojiPicker emojis={emojis} onSelect={(val) => updateDraft({ emoji: val })} />
            </div>
          </div>

          {/* 역할 선택 */}
          <RolePicker roles={roles} value={draft.roleId} onChange={handleRoleChange} />

          {/* 모드 선택 (GRANT/TOGGLE) */}
          <ModeSelector value={draft.mode} onChange={handleModeChange} />

          {/* 스타일 선택 */}
          <StyleSelector value={draft.style} onChange={handleStyleChange} />
        </div>

        {/* 모달 푸터 */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            {t('rolePanel.modalCancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            {t('rolePanel.modalSave')}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * isOpen이 true일 때만 Inner를 마운트하여, 열릴 때마다 상태를 초기화한다.
 */
export function ButtonEditModal({ isOpen, ...rest }: ButtonEditModalProps) {
  if (!isOpen) return null;
  return <ButtonEditModalInner {...rest} />;
}
