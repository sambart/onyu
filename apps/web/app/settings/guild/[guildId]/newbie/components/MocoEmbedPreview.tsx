'use client';

import type { MocoTemplate } from '../../../../../lib/newbie-api';
import { DEFAULT_MOCO_TEMPLATE } from '../../../../../lib/newbie-api';
import { applyDummyVars, MOCO_PREVIEW_DUMMY } from '../../../../../lib/newbie-template-utils';

const MOCO_EMBED_COLOR = '#5865F2';

interface MocoEmbedPreviewProps {
  template: MocoTemplate;
}

export default function MocoEmbedPreview({ template }: MocoEmbedPreviewProps) {
  const title = applyDummyVars(
    template.titleTemplate ?? DEFAULT_MOCO_TEMPLATE.titleTemplate ?? '',
    MOCO_PREVIEW_DUMMY,
  );

  const itemRendered = applyDummyVars(
    template.itemTemplate ?? DEFAULT_MOCO_TEMPLATE.itemTemplate ?? '',
    MOCO_PREVIEW_DUMMY,
  );

  // bodyTemplate의 {mocoList}를 itemRendered로 치환 후 나머지 변수 치환
  const bodyWithList = (template.bodyTemplate ?? DEFAULT_MOCO_TEMPLATE.bodyTemplate ?? '').replace(
    /\{mocoList\}/g,
    itemRendered,
  );
  const description = applyDummyVars(bodyWithList, MOCO_PREVIEW_DUMMY);

  const footer = applyDummyVars(
    template.footerTemplate ?? DEFAULT_MOCO_TEMPLATE.footerTemplate ?? '',
    MOCO_PREVIEW_DUMMY,
  );

  const scoringTmpl = template.scoringTemplate;
  let scoringText = '';
  if (scoringTmpl !== '' && scoringTmpl !== null) {
    scoringText = applyDummyVars(
      scoringTmpl ?? DEFAULT_MOCO_TEMPLATE.scoringTemplate ?? '',
      MOCO_PREVIEW_DUMMY,
    );
  }

  return (
    <div>
      <p className="text-sm font-medium text-gray-700 mb-2">미리보기</p>
      <div className="bg-[#2B2D31] rounded-lg p-4">
        <div
          className="bg-[#313338] rounded-md overflow-hidden"
          style={{ borderLeft: `4px solid ${MOCO_EMBED_COLOR}` }}
        >
          <div className="p-4">
            <p className="text-white font-semibold text-sm mb-1 break-words">{title}</p>
            <p className="text-gray-300 text-xs whitespace-pre-wrap break-words mb-3">
              {description}
            </p>
            {scoringText && (
              <p className="text-gray-400 text-[10px] whitespace-pre-wrap break-words mt-2 pt-2 border-t border-gray-600">
                {scoringText}
              </p>
            )}
            <p className="text-gray-500 text-[10px] border-t border-gray-600 pt-2">{footer}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
