'use client';

import { Loader2, Lock, Server } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { useToast } from '@/components/ui/toast';

import type { Guild } from '../../../components/Header';
import { useUnsavedChangesGuard } from '../../../components/settings/useUnsavedChangesGuard';
import type { UserPrivacyConfig, UserPrivacySaveDto } from '../../../lib/user-privacy-api';
import { fetchUserPrivacy, saveUserPrivacy } from '../../../lib/user-privacy-api';

/** localStorage에서 선호 길드 ID를 읽는 키 */
const LOCAL_STORAGE_GUILD_KEY = 'selectedGuildId';

/** 기본 privacy 설정 (API 응답 전 초기 상태) */
const DEFAULT_PRIVACY: Pick<UserPrivacyConfig, 'disableRelationshipShare'> = {
  disableRelationshipShare: false,
};

export default function PrivacyPage() {
  const t = useTranslations('settings');
  const toast = useToast();

  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [selectedGuildId, setSelectedGuildId] = useState('');
  const [disableRelationshipShare, setDisableRelationshipShare] = useState(
    DEFAULT_PRIVACY.disableRelationshipShare,
  );

  const [isLoadingGuilds, setIsLoadingGuilds] = useState(true);
  // true로 초기화 — false로 두면 길드 로딩 완료 직후, 실제 privacy 값이 도착하기 전에
  // 기본값(DEFAULT_PRIVACY)으로 토글이 잠깐 렌더링되는 깜빡임(race)이 발생한다.
  const [isLoadingPrivacy, setIsLoadingPrivacy] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // 저장 스냅샷(로드/저장 직후 상태) — dirty 판정용
  const savedSnapshotRef = useRef<boolean>(DEFAULT_PRIVACY.disableRelationshipShare);
  const isDirty = disableRelationshipShare !== savedSnapshotRef.current;
  useUnsavedChangesGuard(isDirty);

  // ─── 길드 목록 로드 + 초기 선호 길드 결정 ─────────────────────────────────

  useEffect(() => {
    fetch('/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { user?: { guilds?: Guild[] } } | null) => {
        if (!data?.user) {
          // 미인증 → 로그인 페이지로 리다이렉트
          window.location.href = `/auth/discord?returnTo=${encodeURIComponent(window.location.pathname)}`;
          return;
        }
        const userGuilds: Guild[] = data.user.guilds ?? [];
        setGuilds(userGuilds);

        const storedId = localStorage.getItem(LOCAL_STORAGE_GUILD_KEY) ?? '';
        const hasStoredGuild = userGuilds.some((g) => g.id === storedId);
        const initialId = hasStoredGuild ? storedId : (userGuilds[0]?.id ?? '');
        setSelectedGuildId(initialId);
      })
      .catch((err: unknown) => {
        // 네트워크 오류 시 빈 길드 목록 유지 — UI 파괴를 방지하기 위해 상위로 throw하지 않음
        console.error('길드 목록 조회 실패:', err);
      })
      .finally(() => setIsLoadingGuilds(false));
  }, []);

  // ─── 선택된 길드가 바뀌면 privacy 설정 조회 ───────────────────────────────

  useEffect(() => {
    if (!selectedGuildId) return;

    setIsLoadingPrivacy(true);

    fetchUserPrivacy(selectedGuildId)
      .then((config) => {
        setDisableRelationshipShare(config.disableRelationshipShare);
        savedSnapshotRef.current = config.disableRelationshipShare;
      })
      .catch((err: unknown) => {
        console.error('사생활 설정 조회 실패:', err);
        setDisableRelationshipShare(DEFAULT_PRIVACY.disableRelationshipShare);
        savedSnapshotRef.current = DEFAULT_PRIVACY.disableRelationshipShare;
      })
      .finally(() => setIsLoadingPrivacy(false));
  }, [selectedGuildId]);

  // ─── 길드 선택 변경 핸들러 ────────────────────────────────────────────────

  const handleGuildSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedGuildId(e.target.value);
  };

  // ─── 토글 변경 핸들러 ─────────────────────────────────────────────────────

  const handleToggleChange = () => {
    setDisableRelationshipShare((prev) => !prev);
  };

  // ─── 저장 핸들러 ──────────────────────────────────────────────────────────

  const handleSaveClick = async () => {
    if (!selectedGuildId || isSaving) return;

    setIsSaving(true);

    const dto: UserPrivacySaveDto = {
      guildId: selectedGuildId,
      disableRelationshipShare,
    };

    try {
      await saveUserPrivacy(selectedGuildId, dto);
      savedSnapshotRef.current = disableRelationshipShare;
      toast.success(t('common.saveSuccess'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.saveError'));
    } finally {
      setIsSaving(false);
    }
  };

  // ─── 토글 렌더 헬퍼 ───────────────────────────────────────────────────────

  const renderToggle = (checked: boolean, onToggle: () => void) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
        checked ? 'bg-indigo-600' : 'bg-gray-200'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );

  // ─── 조건부 렌더링 ────────────────────────────────────────────────────────

  if (isLoadingGuilds) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('privacy.title')}</h1>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
        </div>
      </div>
    );
  }

  const hasGuilds = guilds.length > 0;

  if (!hasGuilds) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('privacy.title')}</h1>
        <section className="bg-white rounded-xl border border-gray-200 p-8">
          <div className="flex flex-col items-center text-center py-8">
            <Server className="w-12 h-12 text-gray-300 mb-4" />
            <p className="text-sm text-gray-500">{t('privacy.noGuilds')}</p>
          </div>
        </section>
      </div>
    );
  }

  // ─── 메인 렌더링 ──────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl">
      {/* 페이지 헤더 */}
      <div className="flex items-center space-x-3 mb-6">
        <Lock className="w-6 h-6 text-indigo-600" />
        <h1 className="text-2xl font-bold text-gray-900">{t('privacy.title')}</h1>
      </div>

      <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        {/* 길드 선택 드롭다운 */}
        <div>
          <label htmlFor="guild-select" className="block text-sm font-semibold text-gray-900 mb-1">
            {t('privacy.guildSelectLabel')}
          </label>
          <p className="text-xs text-gray-500 mb-2">{t('privacy.guildSelectDesc')}</p>
          <select
            id="guild-select"
            value={selectedGuildId}
            onChange={handleGuildSelect}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {guilds.map((guild) => (
              <option key={guild.id} value={guild.id}>
                {guild.name}
              </option>
            ))}
          </select>
        </div>

        <hr className="border-gray-100" />

        {/* 친밀도 / 베스트 프렌드 노출 섹션 */}
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-4">
            {t('privacy.relationshipShareSection')}
          </h2>

          {isLoadingPrivacy ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {t('privacy.disableRelationshipShare')}
                </p>
                <p className="text-xs text-gray-500 mt-0.5 max-w-md">
                  {t('privacy.disableRelationshipShareDesc')}
                </p>
              </div>
              {/* disableRelationshipShare가 true면 비공개 → 토글 OFF, false면 공개 → 토글 ON */}
              {renderToggle(!disableRelationshipShare, handleToggleChange)}
            </div>
          )}
        </div>

        {/* 저장 버튼 */}
        <div className="flex items-center justify-end gap-4 pt-4 border-t border-gray-100">
          <button
            type="button"
            onClick={() => {
              void handleSaveClick();
            }}
            disabled={isSaving || isLoadingPrivacy || !selectedGuildId}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-sm"
          >
            {isSaving ? t('common.saving') : t('privacy.saveButton')}
          </button>
        </div>
      </section>
    </div>
  );
}
