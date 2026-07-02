'use client';

import { useEffect } from 'react';

import { useUnsavedChangesContext } from './UnsavedChangesContext';

/**
 * 설정 페이지가 자신의 dirty 상태를 UnsavedChangesContext에 등록하는 훅.
 *
 * - isDirty가 바뀔 때마다 context에 동기화한다.
 * - 페이지 언마운트(다른 설정 페이지로 이동 등) 시 dirty를 false로 초기화한다.
 * - `confirmDiscardIfDirty()`는 페이지 내부 전환(탭 전환 등) 직전에 호출하여
 *   dirty 상태면 confirm 다이얼로그를 띄우고 결과를 반환한다(사이드바와 동일 문구 재사용).
 */
export function useUnsavedChangesGuard(isDirty: boolean): {
  confirmDiscardIfDirty: () => boolean;
} {
  const { setDirty, confirmLeave } = useUnsavedChangesContext();

  useEffect(() => {
    setDirty(isDirty);
  }, [isDirty, setDirty]);

  useEffect(() => {
    return () => setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 언마운트 시 1회만 실행되어야 함
  }, []);

  return { confirmDiscardIfDirty: confirmLeave };
}
