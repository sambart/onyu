'use client';

import type { MissionTemplate } from '../../../../../lib/newbie-api';
import { DEFAULT_MISSION_TEMPLATE } from '../../../../../lib/newbie-api';
import { applyDummyVars, MISSION_PREVIEW_DUMMY } from '../../../../../lib/newbie-template-utils';

const MISSION_EMBED_COLOR = '#57F287';

interface MissionEmbedPreviewProps {
  template: MissionTemplate;
}

export default function MissionEmbedPreview({ template }: MissionEmbedPreviewProps) {
  const title = applyDummyVars(
    template.titleTemplate ?? DEFAULT_MISSION_TEMPLATE.titleTemplate ?? '',
    MISSION_PREVIEW_DUMMY,
  );

  const defaultStatusMapping = DEFAULT_MISSION_TEMPLATE.statusMapping;
  const statusEmoji =
    template.statusMapping?.IN_PROGRESS.emoji ?? defaultStatusMapping?.IN_PROGRESS.emoji ?? '';
  const statusText =
    template.statusMapping?.IN_PROGRESS.text ?? defaultStatusMapping?.IN_PROGRESS.text ?? '';

  const itemDummy: Record<string, string> = {
    ...MISSION_PREVIEW_DUMMY,
    '{statusEmoji}': statusEmoji,
    '{statusText}': statusText,
  };

  const itemRendered = applyDummyVars(
    template.itemTemplate ?? DEFAULT_MISSION_TEMPLATE.itemTemplate ?? '',
    itemDummy,
  );

  const header = applyDummyVars(
    template.headerTemplate ?? DEFAULT_MISSION_TEMPLATE.headerTemplate ?? '',
    MISSION_PREVIEW_DUMMY,
  );

  const footer = applyDummyVars(
    template.footerTemplate ?? DEFAULT_MISSION_TEMPLATE.footerTemplate ?? '',
    MISSION_PREVIEW_DUMMY,
  );

  const description = `${header}\n\n${itemRendered}`;

  return (
    <div>
      <p className="text-sm font-medium text-gray-700 mb-2">미리보기</p>
      <div className="bg-[#2B2D31] rounded-lg p-4">
        <div
          className="bg-[#313338] rounded-md overflow-hidden"
          style={{ borderLeft: `4px solid ${MISSION_EMBED_COLOR}` }}
        >
          <div className="p-4">
            <p className="text-white font-semibold text-sm mb-1 break-words">{title}</p>
            <p className="text-gray-300 text-xs whitespace-pre-wrap break-words mb-3">
              {description}
            </p>
            <p className="text-gray-500 text-[10px] border-t border-gray-600 pt-2">{footer}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
