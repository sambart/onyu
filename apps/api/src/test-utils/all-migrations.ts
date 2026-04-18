import { AddVoiceAndMemberTables1772000000000 } from '../migrations/1772000000000-AddVoiceAndMemberTables';
import { AddAutoChannel1772905024511 } from '../migrations/1772905024511-AddAutoChannel';
import { AddNewbie1773100000000 } from '../migrations/1773100000000-AddNewbie';
import { AddStatusPrefix1773200000000 } from '../migrations/1773200000000-AddStatusPrefix';
import { AddAutoChannelEmbed1773300000000 } from '../migrations/1773300000000-AddAutoChannelEmbed';
import { AutoChannelFlowChange1773400000000 } from '../migrations/1773400000000-AutoChannelFlowChange';
import { SelfDiagnosis1773475188667 } from '../migrations/1773475188667-1773475187-SelfDiagnosis';
import { AddMissionMocoEmbedFields1773500000000 } from '../migrations/1773500000000-AddMissionMocoEmbedFields';
import { AddChannelNameTemplate1773500000001 } from '../migrations/1773500000001-AddChannelNameTemplate';
import { RenameChannelSuffixToChannelNameTemplate1773600000000 } from '../migrations/1773600000000-RenameChannelSuffixToChannelNameTemplate';
import { AddNewbieTemplates1773700000000 } from '../migrations/1773700000000-AddNewbieTemplates';
import { AddNameToAutoChannelConfig1773800000000 } from '../migrations/1773800000000-AddNameToAutoChannelConfig';
import { AddStickyMessage1773900000000 } from '../migrations/1773900000000-AddStickyMessage';
import { AddPlayCountOptions1774000000000 } from '../migrations/1774000000000-AddPlayCountOptions';
import { AddVoiceExcludedChannel1774100000000 } from '../migrations/1774100000000-AddVoiceExcludedChannel';
import { AddMocoAllowNewbieHunter1774200000000 } from '../migrations/1774200000000-AddMocoAllowNewbieHunter';
import { AddMocoNewbieDays1774300000000 } from '../migrations/1774300000000-AddMocoNewbieDays';
import { AddChannelGuildIdAndHistoryIndex1774400000000 } from '../migrations/1774400000000-AddChannelGuildIdAndHistoryIndex';
import { AddMemberAvatarUrl1774400100000 } from '../migrations/1774400100000-AddMemberAvatarUrl';
import { AddCategoryColumns1774500000000 } from '../migrations/1774500000000-AddCategoryColumns';
import { AddBotMetric1774600000000 } from '../migrations/1774600000000-AddBotMetric';
import { AddMocoHuntingScoreSystem1774700000000 } from '../migrations/1774700000000-AddMocoHuntingScoreSystem';
import { AddMissionHiddenFromEmbed1774800000000 } from '../migrations/1774800000000-AddMissionHiddenFromEmbed';
import { AddMissionStatusLeft1774800100000 } from '../migrations/1774800100000-AddMissionStatusLeft';
import { AddMissionMemberName1774900000000 } from '../migrations/1774900000000-AddMissionMemberName';
import { AddMocoPlayCountOptions1775000000000 } from '../migrations/1775000000000-AddMocoPlayCountOptions';
import { AddWelcomeContent1775100000000 } from '../migrations/1775100000000-AddWelcomeContent';
import { ResetMocoTemplateToDefaults1775200000000 } from '../migrations/1775200000000-ResetMocoTemplateToDefaults';
import { AddInactiveMember1775300000000 } from '../migrations/1775300000000-AddInactiveMember';
import { AddActionKickEnum1775400000000 } from '../migrations/1775400000000-AddActionKickEnum';
import { AddVoiceCoPresence1775500000000 } from '../migrations/1775500000000-AddVoiceCoPresence';
import { AddCooldownEnabled1775600000000 } from '../migrations/1775600000000-AddCooldownEnabled';
import { RemoveDuplicateNewbieMissions1775700000000 } from '../migrations/1775700000000-RemoveDuplicateNewbieMissions';
import { AddRecordedAtColumns1775800000000 } from '../migrations/1775800000000-AddRecordedAtColumns';
import { AddVoiceExtendedData1775900000000 } from '../migrations/1775900000000-AddVoiceExtendedData';
import { PairDailyUnidirectional1776000000000 } from '../migrations/1776000000000-PairDailyUnidirectional';
import { AddInactiveMemberTrendDaily1776900000000 } from '../migrations/1776900000000-AddInactiveMemberTrendDaily';

/** 모든 마이그레이션을 타임스탬프 순서대로 배열 */
export const ALL_MIGRATIONS = [
  AddVoiceAndMemberTables1772000000000,
  AddAutoChannel1772905024511,
  AddNewbie1773100000000,
  AddStatusPrefix1773200000000,
  AddAutoChannelEmbed1773300000000,
  AutoChannelFlowChange1773400000000,
  SelfDiagnosis1773475188667,
  AddMissionMocoEmbedFields1773500000000,
  AddChannelNameTemplate1773500000001,
  RenameChannelSuffixToChannelNameTemplate1773600000000,
  AddNewbieTemplates1773700000000,
  AddNameToAutoChannelConfig1773800000000,
  AddStickyMessage1773900000000,
  AddPlayCountOptions1774000000000,
  AddVoiceExcludedChannel1774100000000,
  AddMocoAllowNewbieHunter1774200000000,
  AddMocoNewbieDays1774300000000,
  AddChannelGuildIdAndHistoryIndex1774400000000,
  AddMemberAvatarUrl1774400100000,
  AddCategoryColumns1774500000000,
  AddBotMetric1774600000000,
  AddMocoHuntingScoreSystem1774700000000,
  AddMissionHiddenFromEmbed1774800000000,
  AddMissionStatusLeft1774800100000,
  AddMissionMemberName1774900000000,
  AddMocoPlayCountOptions1775000000000,
  AddWelcomeContent1775100000000,
  ResetMocoTemplateToDefaults1775200000000,
  AddInactiveMember1775300000000,
  AddActionKickEnum1775400000000,
  AddVoiceCoPresence1775500000000,
  AddCooldownEnabled1775600000000,
  RemoveDuplicateNewbieMissions1775700000000,
  AddRecordedAtColumns1775800000000,
  AddVoiceExtendedData1775900000000,
  PairDailyUnidirectional1776000000000,
  AddInactiveMemberTrendDaily1776900000000,
];
