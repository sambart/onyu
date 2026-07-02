'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import {
  type AdminRole,
  type AdminUser,
  createAdmin,
  deactivateAdmin,
  fetchAdmins,
  updateAdminRole,
} from '@/app/lib/admin-api';
import { ApiError } from '@/app/lib/api-client';
import { useToast } from '@/components/ui/toast';

import AddAdminModal from './components/AddAdminModal';
import AdminTable from './components/AdminTable';
import RelogNoticeBanner from './components/RelogNoticeBanner';

const HTTP_CONFLICT = 409;
const HTTP_NOT_FOUND = 404;
const HTTP_FORBIDDEN = 403;
const HTTP_BAD_REQUEST = 400;

// eslint-disable-next-line max-lines-per-function -- 관리자 관리 콘솔: scope 게이트 + 목록/추가/역할변경/비활성화 상태 통합
export default function AdminsPage() {
  const t = useTranslations('admin');
  const router = useRouter();
  const toast = useToast();

  // 인증 컨텍스트
  const [currentUserDiscordId, setCurrentUserDiscordId] = useState<string | null>(null);
  const [hasAdminManageScope, setHasAdminManageScope] = useState<boolean | null>(null);

  // 목록 상태
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 뮤테이션 상태
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // 추가 모달
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // scope 게이트 + 현재 사용자 정보 로드
  useEffect(() => {
    fetch('/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.user) {
          router.replace('/');
          return;
        }
        const scopeList: string[] = data.user.scopes ?? [];
        const canManage = scopeList.includes('admin:manage');
        setHasAdminManageScope(canManage);
        setCurrentUserDiscordId(data.user.discordId ?? null);
        if (!canManage) {
          router.replace('/admin');
        }
      })
      .catch((err: unknown) => {
        console.error('[AdminsPage] /auth/me 확인 실패', err);
        router.replace('/admin');
      });
  }, [router]);

  // 관리자 목록 로드
  useEffect(() => {
    if (hasAdminManageScope !== true) return;

    let cancelled = false;

    async function loadAdmins() {
      setIsLoading(true);
      setError(null);
      try {
        const data = await fetchAdmins();
        if (!cancelled) setAdmins(data);
      } catch {
        if (!cancelled) setError(t('admins.loadFailed'));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadAdmins();
    return () => {
      cancelled = true;
    };
  }, [hasAdminManageScope, t]);

  function resolveApiError(err: unknown): string {
    if (err instanceof ApiError) {
      if (err.status === HTTP_CONFLICT || err.code === 'DUPLICATE_ADMIN') {
        return t('admins.error.duplicate');
      }
      if (err.status === HTTP_NOT_FOUND) {
        return t('admins.error.notFound');
      }
      if (err.status === HTTP_FORBIDDEN) {
        return t('admins.error.forbidden');
      }
      if (err.status === HTTP_BAD_REQUEST) {
        return t('admins.error.lastSuperAdmin');
      }
    }
    return t('admins.error.generic');
  }

  async function reloadAdmins() {
    try {
      const data = await fetchAdmins();
      setAdmins(data);
    } catch (err: unknown) {
      // mutation 후 재조회 실패 시 기존 목록 유지 — 사용자는 이미 mutation 결과 토스트를 봤음
      console.warn('[AdminsPage] reloadAdmins 실패, 기존 목록 유지', err);
    }
  }

  function handleAddModalOpen() {
    setIsAddModalOpen(true);
    setActionError(null);
  }

  function handleAddModalCancel() {
    setIsAddModalOpen(false);
  }

  async function handleAddAdmin(discordUserId: string, role: AdminRole) {
    setIsSubmitting(true);
    setActionError(null);
    try {
      await createAdmin({ discordUserId, role });
      setIsAddModalOpen(false);
      await reloadAdmins();
      toast.success(t('admins.toast.added'));
    } catch (err: unknown) {
      const message = resolveApiError(err);
      setActionError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleChangeRole(discordUserId: string, newRole: AdminRole) {
    setIsSubmitting(true);
    setActionError(null);
    try {
      await updateAdminRole(discordUserId, newRole);
      await reloadAdmins();
      toast.success(t('admins.toast.roleChanged'));
    } catch (err: unknown) {
      const message = resolveApiError(err);
      setActionError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeactivate(discordUserId: string) {
    setIsSubmitting(true);
    setActionError(null);
    try {
      await deactivateAdmin(discordUserId);
      await reloadAdmins();
      toast.success(t('admins.toast.deactivated'));
    } catch (err: unknown) {
      const message = resolveApiError(err);
      setActionError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  // scope 확인 중
  if (hasAdminManageScope === null) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <p className="text-sm text-gray-500">{t('loading')}</p>
      </div>
    );
  }

  // scope 미보유 (리다이렉트 중)
  if (!hasAdminManageScope) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <p className="text-sm text-red-500">{t('admins.accessDeniedScope')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <RelogNoticeBanner />

      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">{t('admins.title')}</h2>
        <button
          type="button"
          onClick={handleAddModalOpen}
          disabled={isSubmitting}
          className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {t('admins.add.button')}
        </button>
      </div>

      {/* 액션 에러 */}
      {actionError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <p className="text-sm text-red-700">{actionError}</p>
        </div>
      )}

      {/* 목록 */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-sm text-gray-500">{t('loading')}</p>
        </div>
      ) : error ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-sm text-red-500">{error}</p>
        </div>
      ) : admins.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-sm text-gray-500">{t('admins.empty')}</p>
        </div>
      ) : (
        <AdminTable
          admins={admins}
          currentUserDiscordId={currentUserDiscordId ?? ''}
          isSubmitting={isSubmitting}
          onChangeRole={handleChangeRole}
          onDeactivate={handleDeactivate}
        />
      )}

      {/* 추가 모달 */}
      <AddAdminModal
        isOpen={isAddModalOpen}
        isSubmitting={isSubmitting}
        onSubmit={handleAddAdmin}
        onCancel={handleAddModalCancel}
      />
    </div>
  );
}
