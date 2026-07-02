'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

interface UnsavedChangesContextValue {
  /** 현재 설정 페이지에 저장되지 않은 변경사항이 있는지 여부 */
  isDirty: boolean;
  /** 페이지가 자신의 dirty 상태를 등록/해제한다 (useUnsavedChangesGuard 전용) */
  setDirty: (dirty: boolean) => void;
  /**
   * dirty 상태면 confirm 다이얼로그를 띄우고 사용자의 선택 결과를 반환한다.
   * dirty 가 아니면 항상 true(이동 허용)를 반환한다.
   */
  confirmLeave: () => boolean;
}

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(null);

/**
 * 설정 레이아웃 레벨에서 dirty 상태를 공유하고, 네비게이션 확인 게이트를 제공하는 Provider.
 *
 * - 사이드바(SettingsSidebar)와 페이지(각 page.tsx)가 동일 Provider 트리 안에 있어야
 *   페이지의 dirty 상태를 사이드바 Link 클릭 인터셉트에서 확인할 수 있다.
 * - dirty 값에 따라 `beforeunload` 리스너를 등록/해제하여 새로고침·탭 닫기·URL 직접 이동을 방어한다.
 */
export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const t = useTranslations('settings.common.unsaved');
  const [isDirty, setIsDirty] = useState(false);
  // beforeunload 핸들러 안에서 최신 t()를 참조하기 위한 ref (deps 배열에 t를 넣지 않기 위함)
  const messageRef = useRef(t('beforeUnload'));

  useEffect(() => {
    messageRef.current = t('beforeUnload');
  }, [t]);

  useEffect(() => {
    if (!isDirty) return undefined;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // 대부분의 브라우저는 커스텀 문구를 무시하지만 non-empty returnValue가 필요하다
      e.returnValue = messageRef.current;
      return messageRef.current;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const confirmLeave = useCallback((): boolean => {
    if (!isDirty) return true;
    return window.confirm(t('confirmLeave'));
  }, [isDirty, t]);

  return (
    <UnsavedChangesContext.Provider value={{ isDirty, setDirty: setIsDirty, confirmLeave }}>
      {children}
    </UnsavedChangesContext.Provider>
  );
}

/**
 * UnsavedChangesContext를 소비한다. Provider 밖에서 호출하면 에러를 throw한다.
 */
export function useUnsavedChangesContext(): UnsavedChangesContextValue {
  const ctx = useContext(UnsavedChangesContext);
  if (!ctx) {
    throw new Error('useUnsavedChangesContext must be used within UnsavedChangesProvider');
  }
  return ctx;
}
