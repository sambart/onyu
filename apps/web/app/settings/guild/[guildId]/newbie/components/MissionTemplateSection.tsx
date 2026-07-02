'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import type { MissionStatusMapping, MissionTemplate } from '../../../../../lib/newbie-api';
import { DEFAULT_MISSION_TEMPLATE } from '../../../../../lib/newbie-api';
import {
  MISSION_ALLOWED_VARS,
  validateMissionTemplate,
} from '../../../../../lib/newbie-template-utils';
import MissionEmbedPreview from './MissionEmbedPreview';

interface MissionTemplateSectionProps {
  template: MissionTemplate;
  onChange: (template: MissionTemplate) => void;
  onSave: () => void;
  isSaving: boolean;
  saveError: string | null;
  /** true이면 저장 안 된 변경사항이 있음을 배지로 표시한다 */
  isDirty: boolean;
  isEnabled: boolean;
}

export default function MissionTemplateSection({
  template,
  onChange,
  onSave,
  isSaving,
  saveError,
  isDirty,
  isEnabled,
}: MissionTemplateSectionProps) {
  const t = useTranslations('settings');
  const [previewTemplate, setPreviewTemplate] = useState<MissionTemplate>(template);
  const [validationErrors, setValidationErrors] = useState<Map<string, string[]>>(new Map());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // template prop 변경 시 previewTemplate 동기화 (탭 전환 복귀 시)
  useEffect(() => {
    setPreviewTemplate(template);
  }, [template]);

  // 컴포넌트 언마운트 시 debounce 정리
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleFieldChange = (partial: Partial<MissionTemplate>) => {
    const next = { ...template, ...partial };
    onChange(next);

    // 유효성 검사 즉시 실행
    const errors = validateMissionTemplate(next);
    setValidationErrors(errors);

    // 미리보기는 300ms debounce
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPreviewTemplate(next);
    }, 300);
  };

  const handleStatusMappingChange = (
    status: keyof MissionStatusMapping,
    field: 'emoji' | 'text',
    value: string,
  ) => {
    const currentMapping = template.statusMapping ??
      DEFAULT_MISSION_TEMPLATE.statusMapping ?? {
        IN_PROGRESS: { emoji: '', text: '' },
        COMPLETED: { emoji: '', text: '' },
        FAILED: { emoji: '', text: '' },
        LEFT: { emoji: '', text: '' },
      };
    const nextMapping: MissionStatusMapping = {
      ...currentMapping,
      [status]: {
        ...currentMapping[status],
        [field]: value,
      },
    };
    handleFieldChange({ statusMapping: nextMapping });
  };

  const handleRestore = () => {
    onChange(DEFAULT_MISSION_TEMPLATE);
    setValidationErrors(new Map());
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setPreviewTemplate(DEFAULT_MISSION_TEMPLATE);
  };

  const inputClass = (fieldName: string) =>
    `w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 ${
      validationErrors.has(fieldName)
        ? 'border-red-400 focus:ring-red-500'
        : 'border-gray-300 focus:ring-indigo-500'
    } disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed`;

  const statusLabels: Record<keyof MissionStatusMapping, string> = {
    IN_PROGRESS: '진행중',
    COMPLETED: '완료',
    FAILED: '실패',
    LEFT: '퇴장',
  };

  return (
    <div className="space-y-6">
      {/* 섹션 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-900">Embed 템플릿 설정</p>
          <p className="text-xs text-gray-500 mt-0.5">
            이 섹션의 설정은 하단 &quot;템플릿 저장&quot; 버튼으로 별도 저장됩니다.
          </p>
        </div>
      </div>

      {/* 2단 그리드: 왼쪽 입력 / 오른쪽 미리보기 */}
      <div className="lg:grid lg:grid-cols-2 lg:gap-6 space-y-6 lg:space-y-0">
        {/* 왼쪽 열: 입력 필드 */}
        <div className="space-y-5">
          {/* 제목 템플릿 */}
          <div>
            <label
              htmlFor="mission-title-template"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              제목 템플릿
            </label>
            <input
              id="mission-title-template"
              type="text"
              value={template.titleTemplate ?? ''}
              onChange={(e) => handleFieldChange({ titleTemplate: e.target.value || null })}
              disabled={!isEnabled}
              placeholder={DEFAULT_MISSION_TEMPLATE.titleTemplate ?? ''}
              className={inputClass('titleTemplate')}
            />
            <div className="flex flex-wrap gap-1 mt-1">
              {MISSION_ALLOWED_VARS.titleTemplate.map((v) => (
                <code
                  key={v}
                  className="text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-mono"
                >
                  {v}
                </code>
              ))}
            </div>
            {validationErrors.has('titleTemplate') && (
              <p className="text-xs text-red-500 mt-1">
                허용되지 않는 변수: {(validationErrors.get('titleTemplate') ?? []).join(', ')}
              </p>
            )}
          </div>

          {/* 헤더 템플릿 */}
          <div>
            <label
              htmlFor="mission-header-template"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              헤더 템플릿
            </label>
            <input
              id="mission-header-template"
              type="text"
              value={template.headerTemplate ?? ''}
              onChange={(e) => handleFieldChange({ headerTemplate: e.target.value || null })}
              disabled={!isEnabled}
              placeholder={DEFAULT_MISSION_TEMPLATE.headerTemplate ?? ''}
              className={inputClass('headerTemplate')}
            />
            <div className="flex flex-wrap gap-1 mt-1">
              {MISSION_ALLOWED_VARS.headerTemplate.map((v) => (
                <code
                  key={v}
                  className="text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-mono"
                >
                  {v}
                </code>
              ))}
            </div>
            {validationErrors.has('headerTemplate') && (
              <p className="text-xs text-red-500 mt-1">
                허용되지 않는 변수: {(validationErrors.get('headerTemplate') ?? []).join(', ')}
              </p>
            )}
          </div>

          {/* 항목 템플릿 */}
          <div>
            <label
              htmlFor="mission-item-template"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              항목 템플릿
            </label>
            <textarea
              id="mission-item-template"
              rows={5}
              value={template.itemTemplate ?? ''}
              onChange={(e) => handleFieldChange({ itemTemplate: e.target.value || null })}
              disabled={!isEnabled}
              placeholder={DEFAULT_MISSION_TEMPLATE.itemTemplate ?? ''}
              className={`${inputClass('itemTemplate')} resize-none`}
            />
            <div className="flex flex-wrap gap-1 mt-1">
              {MISSION_ALLOWED_VARS.itemTemplate.map((v) => (
                <code
                  key={v}
                  className="text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-mono"
                >
                  {v}
                </code>
              ))}
            </div>
            {validationErrors.has('itemTemplate') && (
              <p className="text-xs text-red-500 mt-1">
                허용되지 않는 변수: {(validationErrors.get('itemTemplate') ?? []).join(', ')}
              </p>
            )}
          </div>

          {/* 푸터 템플릿 */}
          <div>
            <label
              htmlFor="mission-footer-template"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              푸터 템플릿
            </label>
            <input
              id="mission-footer-template"
              type="text"
              value={template.footerTemplate ?? ''}
              onChange={(e) => handleFieldChange({ footerTemplate: e.target.value || null })}
              disabled={!isEnabled}
              placeholder={DEFAULT_MISSION_TEMPLATE.footerTemplate ?? ''}
              className={inputClass('footerTemplate')}
            />
            <div className="flex flex-wrap gap-1 mt-1">
              {MISSION_ALLOWED_VARS.footerTemplate.map((v) => (
                <code
                  key={v}
                  className="text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-mono"
                >
                  {v}
                </code>
              ))}
            </div>
            {validationErrors.has('footerTemplate') && (
              <p className="text-xs text-red-500 mt-1">
                허용되지 않는 변수: {(validationErrors.get('footerTemplate') ?? []).join(', ')}
              </p>
            )}
          </div>

          {/* 상태 매핑 테이블 */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">상태 매핑</p>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-gray-500 text-xs">
                  <th className="pb-2 font-medium w-16">상태</th>
                  <th className="pb-2 font-medium w-20">이모지</th>
                  <th className="pb-2 font-medium">텍스트</th>
                </tr>
              </thead>
              <tbody>
                {(['IN_PROGRESS', 'COMPLETED', 'FAILED'] as const).map((status) => {
                  const currentMapping = template.statusMapping ??
                    DEFAULT_MISSION_TEMPLATE.statusMapping ?? {
                      IN_PROGRESS: { emoji: '', text: '' },
                      COMPLETED: { emoji: '', text: '' },
                      FAILED: { emoji: '', text: '' },
                      LEFT: { emoji: '', text: '' },
                    };
                  return (
                    <tr key={status}>
                      <td className="pr-2 py-1 text-gray-600 text-xs whitespace-nowrap">
                        {statusLabels[status]}
                      </td>
                      <td className="pr-2 py-1">
                        <input
                          type="text"
                          value={currentMapping[status].emoji}
                          onChange={(e) =>
                            handleStatusMappingChange(status, 'emoji', e.target.value)
                          }
                          disabled={!isEnabled}
                          maxLength={8}
                          className="w-16 px-2 py-1 border border-gray-300 rounded text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:cursor-not-allowed"
                        />
                      </td>
                      <td className="py-1">
                        <input
                          type="text"
                          value={currentMapping[status].text}
                          onChange={(e) =>
                            handleStatusMappingChange(status, 'text', e.target.value)
                          }
                          disabled={!isEnabled}
                          maxLength={20}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:cursor-not-allowed"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 기본값 복원 + 저장 버튼 + 미저장 배지 */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleRestore}
              disabled={!isEnabled}
              className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              기본값 복원
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={isSaving || !isEnabled || validationErrors.size > 0}
              className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSaving ? '저장 중...' : '템플릿 저장'}
            </button>
            {isDirty && (
              <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                {t('common.unsaved.badge')}
              </span>
            )}
          </div>

          {/* 저장 피드백 (검증 에러만 인라인 유지 — 성공/네트워크 실패는 토스트) */}
          {saveError && <p className="text-sm text-red-600 font-medium">{saveError}</p>}
        </div>

        {/* 오른쪽 열: 미리보기 (sticky) */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <MissionEmbedPreview template={previewTemplate} />
        </div>
      </div>
    </div>
  );
}
