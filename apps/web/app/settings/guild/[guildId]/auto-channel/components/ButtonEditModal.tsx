import { Trash2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import GuildEmojiPicker from '../../../../../components/GuildEmojiPicker';
import type { DiscordChannel, DiscordEmoji } from '../../../../../lib/discord-api';
import type { ButtonForm, SubOptionForm } from '../types';
import { EMPTY_BUTTON, EMPTY_SUB } from '../types';

interface ButtonEditModalProps {
  isOpen: boolean;
  button: ButtonForm | null;
  categories: DiscordChannel[];
  emojis: DiscordEmoji[];
  onSave: (button: ButtonForm) => void;
  onClose: () => void;
}

function ButtonEditModalInner({
  button,
  categories,
  emojis,
  onSave,
  onClose,
}: Omit<ButtonEditModalProps, 'isOpen'>) {
  const t = useTranslations('settings');
  const [draft, setDraft] = useState<ButtonForm>(
    button ? { ...button, subOptions: button.subOptions.map((s) => ({ ...s })) } : { ...EMPTY_BUTTON, subOptions: [] },
  );

  function updateDraft(partial: Partial<ButtonForm>) {
    setDraft((prev) => ({ ...prev, ...partial }));
  }

  function updateSubOption(subIdx: number, partial: Partial<SubOptionForm>) {
    setDraft((prev) => ({
      ...prev,
      subOptions: prev.subOptions.map((s, j) => (j === subIdx ? { ...s, ...partial } : s)),
    }));
  }

  function addSubOption() {
    setDraft((prev) => ({ ...prev, subOptions: [...prev.subOptions, { ...EMPTY_SUB }] }));
  }

  function removeSubOption(subIdx: number) {
    setDraft((prev) => ({
      ...prev,
      subOptions: prev.subOptions.filter((_, j) => j !== subIdx),
    }));
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
            {button === null ? t('autoChannel.addButton') : t('autoChannel.editButton')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('autoChannel.modalCancel')}
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
              {t('autoChannel.buttonLabel')} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={draft.label}
              onChange={(e) => updateDraft({ label: e.target.value })}
              placeholder="오버워치"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* 이모지 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('autoChannel.buttonEmoji')}
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

          {/* 대상 카테고리 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('autoChannel.buttonCategory')} <span className="text-red-500">*</span>
            </label>
            <select
              value={draft.targetCategoryId}
              onChange={(e) => updateDraft({ targetCategoryId: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">{t('autoChannel.categorySelect')}</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          {/* 채널명 템플릿 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('autoChannel.channelNameTemplate')}
            </label>
            <input
              type="text"
              value={draft.channelNameTemplate}
              onChange={(e) => updateDraft({ channelNameTemplate: e.target.value })}
              placeholder={`{username}의 ${draft.label || '게임'}`}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              {t('autoChannel.channelNameTemplateDesc', {
                default: `{username}의 ${draft.label || t('autoChannel.buttonLabel')}`,
              })}
            </p>
          </div>

          {/* 하위 선택지 */}
          <div className="pt-3 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">
                {t('autoChannel.subOptions', { count: draft.subOptions.length })}
              </span>
              <button
                type="button"
                onClick={addSubOption}
                className="text-xs text-indigo-500 hover:text-indigo-700 transition-colors"
              >
                {t('common.tabAdd')}
              </button>
            </div>

            {draft.subOptions.length > 0 && (
              <p className="text-xs text-gray-400 mb-2">{t('autoChannel.subOptionsDesc')}</p>
            )}

            {draft.subOptions.length > 0 && (
              <div className="flex items-center gap-2 mb-1">
                <span className="w-24 text-[10px] font-medium text-gray-400">
                  {t('autoChannel.subLabelHeader')}
                </span>
                <span className="w-[4.5rem] text-[10px] font-medium text-gray-400">
                  {t('autoChannel.subEmojiHeader')}
                </span>
                <span className="flex-1 text-[10px] font-medium text-gray-400">
                  {t('autoChannel.subChannelNameHeader')}
                </span>
                <span className="w-4" />
              </div>
            )}

            <div className="space-y-2">
              {draft.subOptions.map((sub, sIdx) => (
                <div key={sIdx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={sub.label}
                    onChange={(e) => updateSubOption(sIdx, { label: e.target.value })}
                    placeholder={t('autoChannel.buttonLabel')}
                    className="w-24 px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={sub.emoji}
                      onChange={(e) => updateSubOption(sIdx, { emoji: e.target.value })}
                      placeholder="🎯"
                      className="w-12 px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <GuildEmojiPicker
                      emojis={emojis}
                      onSelect={(val) => updateSubOption(sIdx, { emoji: val })}
                    />
                  </div>
                  <input
                    type="text"
                    value={sub.channelNameTemplate}
                    onChange={(e) => updateSubOption(sIdx, { channelNameTemplate: e.target.value })}
                    placeholder="일반 {name}"
                    className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => removeSubOption(sIdx)}
                    className="text-red-400 hover:text-red-600 transition-colors flex-shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 모달 푸터 */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            {t('autoChannel.modalCancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            {t('autoChannel.modalSave')}
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
