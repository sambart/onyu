'use client';

import { useEffect, useRef, useState } from 'react';

import type { MocoTemplate } from '../../../../../lib/newbie-api';
import { DEFAULT_MOCO_TEMPLATE } from '../../../../../lib/newbie-api';
import { MOCO_ALLOWED_VARS, validateMocoTemplate } from '../../../../../lib/newbie-template-utils';
import MocoEmbedPreview from './MocoEmbedPreview';

interface MocoTemplateSectionProps {
  template: MocoTemplate;
  onChange: (template: MocoTemplate) => void;
  onSave: () => void;
  isSaving: boolean;
  saveError: string | null;
  saveSuccess: boolean;
  isEnabled: boolean;
}

export default function MocoTemplateSection({
  template,
  onChange,
  onSave,
  isSaving,
  saveError,
  saveSuccess,
  isEnabled,
}: MocoTemplateSectionProps) {
  const [previewTemplate, setPreviewTemplate] = useState<MocoTemplate>(template);
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

  const handleFieldChange = (partial: Partial<MocoTemplate>) => {
    const next = { ...template, ...partial };
    onChange(next);

    // 유효성 검사 즉시 실행
    const errors = validateMocoTemplate(next);
    setValidationErrors(errors);

    // 미리보기는 300ms debounce
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPreviewTemplate(next);
    }, 300);
  };

  const handleRestore = () => {
    onChange(DEFAULT_MOCO_TEMPLATE);
    setValidationErrors(new Map());
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setPreviewTemplate(DEFAULT_MOCO_TEMPLATE);
  };

  const inputClass = (fieldName: string) =>
    `w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 ${
      validationErrors.has(fieldName)
        ? 'border-red-400 focus:ring-red-500'
        : 'border-gray-300 focus:ring-indigo-500'
    } disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed`;

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
              htmlFor="moco-title-template"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              제목 템플릿
            </label>
            <input
              id="moco-title-template"
              type="text"
              value={template.titleTemplate ?? ''}
              onChange={(e) => handleFieldChange({ titleTemplate: e.target.value || null })}
              disabled={!isEnabled}
              placeholder={DEFAULT_MOCO_TEMPLATE.titleTemplate ?? ''}
              className={inputClass('titleTemplate')}
            />
            <div className="flex flex-wrap gap-1 mt-1">
              {MOCO_ALLOWED_VARS.titleTemplate.map((v) => (
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

          {/* 본문 템플릿 */}
          <div>
            <label
              htmlFor="moco-body-template"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              본문 템플릿
            </label>
            <textarea
              id="moco-body-template"
              rows={5}
              value={template.bodyTemplate ?? ''}
              onChange={(e) => handleFieldChange({ bodyTemplate: e.target.value || null })}
              disabled={!isEnabled}
              placeholder={DEFAULT_MOCO_TEMPLATE.bodyTemplate ?? ''}
              className={`${inputClass('bodyTemplate')} resize-none`}
            />
            <div className="flex flex-wrap gap-1 mt-1">
              {MOCO_ALLOWED_VARS.bodyTemplate.map((v) => (
                <code
                  key={v}
                  className="text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-mono"
                >
                  {v}
                </code>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {'{mocoList}'} 위치에 항목 템플릿이 반복 삽입됩니다.
            </p>
            {validationErrors.has('bodyTemplate') && (
              <p className="text-xs text-red-500 mt-1">
                허용되지 않는 변수: {(validationErrors.get('bodyTemplate') ?? []).join(', ')}
              </p>
            )}
          </div>

          {/* 항목 템플릿 */}
          <div>
            <label
              htmlFor="moco-item-template"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              항목 템플릿
            </label>
            <input
              id="moco-item-template"
              type="text"
              value={template.itemTemplate ?? ''}
              onChange={(e) => handleFieldChange({ itemTemplate: e.target.value || null })}
              disabled={!isEnabled}
              placeholder={DEFAULT_MOCO_TEMPLATE.itemTemplate ?? ''}
              className={inputClass('itemTemplate')}
            />
            <div className="flex flex-wrap gap-1 mt-1">
              {MOCO_ALLOWED_VARS.itemTemplate.map((v) => (
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
              htmlFor="moco-footer-template"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              푸터 템플릿
            </label>
            <input
              id="moco-footer-template"
              type="text"
              value={template.footerTemplate ?? ''}
              onChange={(e) => handleFieldChange({ footerTemplate: e.target.value || null })}
              disabled={!isEnabled}
              placeholder={DEFAULT_MOCO_TEMPLATE.footerTemplate ?? ''}
              className={inputClass('footerTemplate')}
            />
            <div className="flex flex-wrap gap-1 mt-1">
              {MOCO_ALLOWED_VARS.footerTemplate.map((v) => (
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

          {/* 점수 산정 안내 템플릿 */}
          <div>
            <label
              htmlFor="moco-scoring-template"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              점수 산정 안내 템플릿
            </label>
            <textarea
              id="moco-scoring-template"
              rows={3}
              value={template.scoringTemplate ?? ''}
              onChange={(e) => handleFieldChange({ scoringTemplate: e.target.value || null })}
              disabled={!isEnabled}
              placeholder={DEFAULT_MOCO_TEMPLATE.scoringTemplate ?? ''}
              className={`${inputClass('scoringTemplate')} resize-none`}
            />
            <div className="flex flex-wrap gap-1 mt-1">
              {MOCO_ALLOWED_VARS.scoringTemplate.map((v) => (
                <code
                  key={v}
                  className="text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-mono"
                >
                  {v}
                </code>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1">
              빈 값으로 두면 점수 산정 안내를 표시하지 않습니다.
            </p>
            {validationErrors.has('scoringTemplate') && (
              <p className="text-xs text-red-500 mt-1">
                허용되지 않는 변수: {(validationErrors.get('scoringTemplate') ?? []).join(', ')}
              </p>
            )}
          </div>

          {/* 기본값 복원 + 저장 버튼 */}
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
          </div>

          {/* 저장 피드백 */}
          {saveSuccess && (
            <p className="text-sm text-green-600 font-medium">템플릿이 저장되었습니다.</p>
          )}
          {saveError && <p className="text-sm text-red-600 font-medium">{saveError}</p>}
        </div>

        {/* 오른쪽 열: 미리보기 (sticky) */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <MocoEmbedPreview template={previewTemplate} />
        </div>
      </div>
    </div>
  );
}
