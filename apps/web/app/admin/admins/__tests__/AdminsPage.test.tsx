/**
 * AdminsPage 통합 테스트
 *
 * 유저 시나리오 검증 (UF-008, UF-009, UF-007):
 * - admin:manage scope 보유 시: 목록 렌더링, RelogNoticeBanner 노출
 * - admin:manage scope 미보유 시: /admin 리다이렉트 (UF-008)
 * - 미인증(data 없음) 시: / 리다이렉트
 * - 관리자 추가 흐름: 모달 열기 → Discord ID+역할 입력 → 제출 → 목록 재조회
 * - 관리자 추가 폼 검증: Discord ID 빈 값 → 에러 메시지 노출
 * - 관리자 추가 API 에러 분기: 409/404/403/400
 * - 역할 변경 흐름: 편집 버튼 → 역할 선택 → 저장 → 목록 재조회
 * - 마지막 super_admin 다운그레이드 시 경고 메시지 노출 (UF-007)
 * - 비활성화 흐름: 클릭 → 확인 다이얼로그 → 확인 → 목록 재조회
 * - 자기 자신 비활성화 버튼 비활성화 (UF-009)
 * - 목록 로드 실패 시 에러 메시지
 * - 로딩 상태 렌더링
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── 전역 모킹 ────────────────────────────────────────────────────────────────

const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// admin-api 전체 모킹 — fetch 직접 사용 대신 함수 단위로 제어
vi.mock('@/app/lib/admin-api', () => ({
  fetchAdmins: vi.fn(),
  createAdmin: vi.fn(),
  updateAdminRole: vi.fn(),
  deactivateAdmin: vi.fn(),
}));

import type { AdminUser } from '@/app/lib/admin-api';
import { createAdmin, deactivateAdmin, fetchAdmins, updateAdminRole } from '@/app/lib/admin-api';
import { ApiError } from '@/app/lib/api-client';

import AdminsPage from '../page';

// ─── 픽스처 ──────────────────────────────────────────────────────────────────

const CURRENT_DISCORD_ID = '111111111111111111';

/** /auth/me 응답: admin:manage scope 보유 */
function mockAuthMeWithManageScope(discordId = CURRENT_DISCORD_ID) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({
        user: {
          discordId,
          scopes: ['admin:manage'],
        },
      }),
  } as unknown as Response);
}

/** /auth/me 응답: scope 미보유 (bot_operator) */
function mockAuthMeWithoutManageScope() {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({
        user: {
          discordId: CURRENT_DISCORD_ID,
          scopes: [],
        },
      }),
  } as unknown as Response);
}

/** /auth/me 응답: 비인증 */
function mockAuthMeUnauthenticated() {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    json: () => Promise.resolve(null),
  } as unknown as Response);
}

function makeAdminUser(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    discordUserId: '222222222222222222',
    role: 'bot_operator',
    grantedBy: 'system',
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

// ─── HTTP 상태 코드 상수 ─────────────────────────────────────────────────────

const HTTP_STATUS_BAD_REQUEST = 400;
const HTTP_STATUS_FORBIDDEN = 403;
const HTTP_STATUS_CONFLICT = 409;

// ─── 타입 캐스트 헬퍼 ────────────────────────────────────────────────────────

const mockFetchAdmins = fetchAdmins as ReturnType<typeof vi.fn>;
const mockCreateAdmin = createAdmin as ReturnType<typeof vi.fn>;
const mockUpdateAdminRole = updateAdminRole as ReturnType<typeof vi.fn>;
const mockDeactivateAdmin = deactivateAdmin as ReturnType<typeof vi.fn>;

// ─── 테스트 ──────────────────────────────────────────────────────────────────

describe('AdminsPage — scope 게이트', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('admin:manage scope 보유 시 목록이 렌더링되고 RelogNoticeBanner가 표시된다', async () => {
    mockAuthMeWithManageScope();
    mockFetchAdmins.mockResolvedValue([
      makeAdminUser({ discordUserId: '222222222222222222', role: 'bot_operator' }),
    ]);

    render(<AdminsPage />);

    await waitFor(() => {
      // 재로그인 안내 배너 (UF-005 — 권한 변경 반영 안내)
      expect(screen.getByText('admins.relogNotice')).toBeInTheDocument();
      // 목록 타이틀
      expect(screen.getByText('admins.title')).toBeInTheDocument();
      // 관리자 row 데이터
      expect(screen.getByText('222222222222222222')).toBeInTheDocument();
    });
  });

  it('admin:manage scope 미보유 시 /admin 으로 리다이렉트된다 (UF-008)', async () => {
    mockAuthMeWithoutManageScope();
    // scope 미보유이므로 fetchAdmins는 호출되지 않아야 함
    mockFetchAdmins.mockResolvedValue([]);

    render(<AdminsPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/admin');
    });

    // 목록 타이틀이 렌더링되지 않아야 함
    expect(screen.queryByText('admins.title')).not.toBeInTheDocument();
  });

  it('비인증 상태(data 없음) 시 / 로 리다이렉트된다', async () => {
    mockAuthMeUnauthenticated();

    render(<AdminsPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/');
    });
  });

  it('scope 확인 중에는 로딩 텍스트가 표시된다', () => {
    // fetch가 완료되지 않도록 pending promise 사용
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));

    render(<AdminsPage />);

    expect(screen.getByText('loading')).toBeInTheDocument();
  });
});

describe('AdminsPage — 관리자 목록 로드', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthMeWithManageScope();
  });

  it('목록이 비어 있을 때 빈 상태 메시지가 표시된다', async () => {
    mockFetchAdmins.mockResolvedValue([]);

    render(<AdminsPage />);

    await waitFor(() => {
      expect(screen.getByText('admins.empty')).toBeInTheDocument();
    });
  });

  it('목록 로드 실패 시 에러 메시지가 표시된다', async () => {
    mockFetchAdmins.mockRejectedValue(new Error('Network error'));

    render(<AdminsPage />);

    await waitFor(() => {
      expect(screen.getByText('admins.loadFailed')).toBeInTheDocument();
    });
  });

  it('목록 로드 중에는 로딩 텍스트가 표시된다', async () => {
    // auth/me는 빠르게 완료, fetchAdmins는 pending
    mockAuthMeWithManageScope();
    mockFetchAdmins.mockReturnValue(new Promise(() => {}));

    render(<AdminsPage />);

    // scope 확인 완료 후 목록 로딩 상태 대기
    await waitFor(() => {
      // 목록 로딩 중 표시
      expect(screen.getByText('loading')).toBeInTheDocument();
    });
  });

  it('여러 관리자가 있을 때 각 행이 렌더링된다', async () => {
    mockFetchAdmins.mockResolvedValue([
      makeAdminUser({ discordUserId: '100000000000000001', role: 'super_admin' }),
      makeAdminUser({ discordUserId: '100000000000000002', role: 'bot_operator' }),
    ]);

    render(<AdminsPage />);

    await waitFor(() => {
      expect(screen.getByText('100000000000000001')).toBeInTheDocument();
      expect(screen.getByText('100000000000000002')).toBeInTheDocument();
    });
  });
});

describe('AdminsPage — 관리자 추가 흐름', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthMeWithManageScope();
    mockFetchAdmins.mockResolvedValue([]);
  });

  it('관리자 추가 버튼 클릭 시 모달이 열린다', async () => {
    const user = userEvent.setup();

    render(<AdminsPage />);

    await waitFor(() => {
      expect(screen.getByText('admins.title')).toBeInTheDocument();
    });

    await user.click(screen.getByText('admins.add.button'));

    // 모달 타이틀 표시
    expect(screen.getByText('admins.add.title')).toBeInTheDocument();
  });

  it('Discord ID 없이 제출 시 검증 에러가 표시된다', async () => {
    const user = userEvent.setup();

    render(<AdminsPage />);

    await waitFor(() => {
      expect(screen.getByText('admins.title')).toBeInTheDocument();
    });

    await user.click(screen.getByText('admins.add.button'));

    // Discord ID 빈 상태에서 제출
    await user.click(screen.getByText('admins.add.submit'));

    expect(screen.getByText('admins.add.discordIdRequired')).toBeInTheDocument();
    // createAdmin이 호출되지 않아야 함
    expect(mockCreateAdmin).not.toHaveBeenCalled();
  });

  it('Discord ID 입력 후 제출 시 createAdmin이 호출되고 모달이 닫힌다', async () => {
    const user = userEvent.setup();
    mockCreateAdmin.mockResolvedValue(undefined);
    mockFetchAdmins.mockResolvedValue([]);

    render(<AdminsPage />);

    await waitFor(() => {
      expect(screen.getByText('admins.title')).toBeInTheDocument();
    });

    // 초기 로드 후 호출 횟수 기록
    const callCountAfterLoad = mockFetchAdmins.mock.calls.length;

    await user.click(screen.getByText('admins.add.button'));

    const input = screen.getByPlaceholderText('000000000000000000');
    await user.type(input, '999888777666555444');

    await user.click(screen.getByText('admins.add.submit'));

    await waitFor(() => {
      expect(mockCreateAdmin).toHaveBeenCalledWith({
        discordUserId: '999888777666555444',
        role: 'bot_operator', // 기본값
      });
    });

    // 모달이 닫혀야 함
    await waitFor(() => {
      expect(screen.queryByText('admins.add.title')).not.toBeInTheDocument();
    });

    // createAdmin 이후 재조회가 추가로 발생했는지 확인
    await waitFor(() => {
      expect(mockFetchAdmins.mock.calls.length).toBeGreaterThan(callCountAfterLoad);
    });
  });

  it('역할을 super_admin으로 선택 후 제출 시 role이 super_admin으로 전달된다', async () => {
    const user = userEvent.setup();
    mockCreateAdmin.mockResolvedValue(undefined);
    mockFetchAdmins.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    render(<AdminsPage />);

    await waitFor(() => {
      expect(screen.getByText('admins.title')).toBeInTheDocument();
    });

    await user.click(screen.getByText('admins.add.button'));

    const input = screen.getByPlaceholderText('000000000000000000');
    await user.type(input, '123456789012345678');

    // 역할 셀렉트에서 super_admin 선택
    const roleSelect = screen.getByRole('combobox');
    await user.selectOptions(roleSelect, 'super_admin');

    await user.click(screen.getByText('admins.add.submit'));

    await waitFor(() => {
      expect(mockCreateAdmin).toHaveBeenCalledWith({
        discordUserId: '123456789012345678',
        role: 'super_admin',
      });
    });
  });

  it('취소 버튼 클릭 시 모달이 닫힌다', async () => {
    const user = userEvent.setup();

    render(<AdminsPage />);

    await waitFor(() => {
      expect(screen.getByText('admins.title')).toBeInTheDocument();
    });

    await user.click(screen.getByText('admins.add.button'));
    expect(screen.getByText('admins.add.title')).toBeInTheDocument();

    await user.click(screen.getByText('admins.add.cancel'));

    expect(screen.queryByText('admins.add.title')).not.toBeInTheDocument();
  });
});

describe('AdminsPage — 관리자 추가 API 에러 UX', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthMeWithManageScope();
    mockFetchAdmins.mockResolvedValue([]);
  });

  async function openModalAndSubmit(discordId: string) {
    const user = userEvent.setup();
    render(<AdminsPage />);

    await waitFor(() => {
      expect(screen.getByText('admins.title')).toBeInTheDocument();
    });

    await user.click(screen.getByText('admins.add.button'));
    const input = screen.getByPlaceholderText('000000000000000000');
    await user.type(input, discordId);
    await user.click(screen.getByText('admins.add.submit'));
  }

  it('409 충돌 에러 시 duplicate 에러 메시지가 표시된다', async () => {
    mockCreateAdmin.mockRejectedValue(new ApiError(HTTP_STATUS_CONFLICT, '이미 존재하는 관리자'));

    await openModalAndSubmit('123456789012345678');

    await waitFor(() => {
      expect(screen.getByText('admins.error.duplicate')).toBeInTheDocument();
    });
  });

  it('404 에러 시 notFound 에러 메시지가 표시된다', async () => {
    mockCreateAdmin.mockRejectedValue(new ApiError(404, '사용자 없음'));

    await openModalAndSubmit('123456789012345678');

    await waitFor(() => {
      expect(screen.getByText('admins.error.notFound')).toBeInTheDocument();
    });
  });

  it('403 에러 시 forbidden 에러 메시지가 표시된다', async () => {
    mockCreateAdmin.mockRejectedValue(new ApiError(HTTP_STATUS_FORBIDDEN, '권한 없음'));

    await openModalAndSubmit('123456789012345678');

    await waitFor(() => {
      expect(screen.getByText('admins.error.forbidden')).toBeInTheDocument();
    });
  });

  it('400 에러 시 lastSuperAdmin 에러 메시지가 표시된다', async () => {
    mockCreateAdmin.mockRejectedValue(new ApiError(HTTP_STATUS_BAD_REQUEST, '유효성 오류'));

    await openModalAndSubmit('123456789012345678');

    await waitFor(() => {
      expect(screen.getByText('admins.error.lastSuperAdmin')).toBeInTheDocument();
    });
  });

  it('알 수 없는 에러 시 generic 에러 메시지가 표시된다', async () => {
    mockCreateAdmin.mockRejectedValue(new Error('Unknown error'));

    await openModalAndSubmit('123456789012345678');

    await waitFor(() => {
      expect(screen.getByText('admins.error.generic')).toBeInTheDocument();
    });
  });

  it('DUPLICATE_ADMIN code 에러 시 duplicate 에러 메시지가 표시된다', async () => {
    mockCreateAdmin.mockRejectedValue(
      new ApiError(HTTP_STATUS_BAD_REQUEST, '중복', 'DUPLICATE_ADMIN'),
    );

    await openModalAndSubmit('123456789012345678');

    await waitFor(() => {
      expect(screen.getByText('admins.error.duplicate')).toBeInTheDocument();
    });
  });
});

describe('AdminsPage — 역할 변경 흐름', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthMeWithManageScope();
  });

  it('역할 변경 버튼 클릭 후 역할 선택하고 저장하면 updateAdminRole이 호출된다', async () => {
    const user = userEvent.setup();
    const admin = makeAdminUser({
      discordUserId: '222222222222222222',
      role: 'bot_operator',
    });
    mockFetchAdmins.mockResolvedValue([admin]);
    mockUpdateAdminRole.mockResolvedValue(undefined);

    render(<AdminsPage />);

    await waitFor(() => {
      expect(screen.getByText('222222222222222222')).toBeInTheDocument();
    });

    // 역할 변경 버튼 클릭
    await user.click(screen.getByText('admins.changeRole.action'));

    // 역할 셀렉트에서 super_admin 선택 — getAllByRole로 첫 번째 combobox 선택
    const [roleSelect] = screen.getAllByRole('combobox');
    await user.selectOptions(roleSelect, 'super_admin');

    // 저장 버튼 클릭 (admins.add.submit key)
    const submitBtns = screen.getAllByText('admins.add.submit');
    await user.click(submitBtns[0]);

    await waitFor(() => {
      expect(mockUpdateAdminRole).toHaveBeenCalledWith('222222222222222222', 'super_admin');
    });
  });

  it('역할 변경 API 에러 시 에러 메시지가 표시된다', async () => {
    const user = userEvent.setup();
    const admin = makeAdminUser({ discordUserId: '222222222222222222', role: 'bot_operator' });
    mockFetchAdmins.mockResolvedValue([admin]);
    mockUpdateAdminRole.mockRejectedValue(new ApiError(404, '없음'));

    render(<AdminsPage />);

    await waitFor(() => {
      expect(screen.getByText('222222222222222222')).toBeInTheDocument();
    });

    await user.click(screen.getByText('admins.changeRole.action'));
    const roleSelect = screen.getByRole('combobox');
    await user.selectOptions(roleSelect, 'super_admin');
    await user.click(screen.getByText('admins.add.submit'));

    await waitFor(() => {
      expect(screen.getByText('admins.error.notFound')).toBeInTheDocument();
    });
  });

  it('역할 변경 취소 시 updateAdminRole이 호출되지 않는다', async () => {
    const user = userEvent.setup();
    const admin = makeAdminUser({ discordUserId: '222222222222222222', role: 'bot_operator' });
    mockFetchAdmins.mockResolvedValue([admin]);

    render(<AdminsPage />);

    await waitFor(() => {
      expect(screen.getByText('222222222222222222')).toBeInTheDocument();
    });

    await user.click(screen.getByText('admins.changeRole.action'));
    // 취소 버튼 클릭 (admins.add.cancel key)
    await user.click(screen.getByText('admins.add.cancel'));

    expect(mockUpdateAdminRole).not.toHaveBeenCalled();
  });
});

describe('AdminsPage — 마지막 super_admin 다운그레이드 경고 (UF-007)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthMeWithManageScope();
  });

  it('활성 super_admin이 1명일 때 다운그레이드 시도 시 경고 메시지가 표시된다', async () => {
    const user = userEvent.setup();
    // 활성 super_admin이 본인 1명뿐
    const admin = makeAdminUser({
      discordUserId: '333333333333333333',
      role: 'super_admin',
      isActive: true,
    });
    mockFetchAdmins.mockResolvedValue([admin]);

    render(<AdminsPage />);

    await waitFor(() => {
      expect(screen.getByText('333333333333333333')).toBeInTheDocument();
    });

    // 역할 변경 버튼 클릭
    await user.click(screen.getByText('admins.changeRole.action'));

    // bot_operator 선택 (다운그레이드)
    const roleSelect = screen.getByRole('combobox');
    await user.selectOptions(roleSelect, 'bot_operator');

    // 경고 메시지 표시 (UF-007)
    await waitFor(() => {
      expect(screen.getByText('admins.constraint.lastSuperAdmin')).toBeInTheDocument();
    });
  });

  it('활성 super_admin이 2명 이상이면 다운그레이드 경고가 표시되지 않는다', async () => {
    const user = userEvent.setup();
    mockFetchAdmins.mockResolvedValue([
      makeAdminUser({ discordUserId: '333333333333333333', role: 'super_admin', isActive: true }),
      makeAdminUser({ discordUserId: '444444444444444444', role: 'super_admin', isActive: true }),
    ]);

    render(<AdminsPage />);

    await waitFor(() => {
      expect(screen.getByText('333333333333333333')).toBeInTheDocument();
    });

    // 첫 번째 super_admin의 역할 변경 시도
    const changeRoleBtns = screen.getAllByText('admins.changeRole.action');
    await user.click(changeRoleBtns[0]);

    const roleSelect = screen.getAllByRole('combobox')[0];
    await user.selectOptions(roleSelect, 'bot_operator');

    // 경고 메시지가 표시되지 않아야 함
    expect(screen.queryByText('admins.constraint.lastSuperAdmin')).not.toBeInTheDocument();
  });
});

describe('AdminsPage — 비활성화 흐름', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthMeWithManageScope(CURRENT_DISCORD_ID);
  });

  it('비활성화 버튼 클릭 시 확인 다이얼로그가 열린다', async () => {
    const user = userEvent.setup();
    const admin = makeAdminUser({
      discordUserId: '555555555555555555',
      isActive: true,
    });
    mockFetchAdmins.mockResolvedValue([admin]);

    render(<AdminsPage />);

    await waitFor(() => {
      expect(screen.getByText('555555555555555555')).toBeInTheDocument();
    });

    await user.click(screen.getByText('admins.deactivate.action'));

    // 확인 다이얼로그 표시
    expect(screen.getByText('admins.deactivate.confirmTitle')).toBeInTheDocument();
    expect(screen.getByText('admins.deactivate.confirm')).toBeInTheDocument();
  });

  it('비활성화 확인 시 deactivateAdmin이 호출되고 목록이 재조회된다', async () => {
    const user = userEvent.setup();
    const admin = makeAdminUser({
      discordUserId: '555555555555555555',
      isActive: true,
    });
    mockFetchAdmins.mockResolvedValue([admin]);
    mockDeactivateAdmin.mockResolvedValue(undefined);

    render(<AdminsPage />);

    await waitFor(() => {
      expect(screen.getByText('555555555555555555')).toBeInTheDocument();
    });

    // 초기 로드 후 호출 횟수 기록
    const callCountAfterLoad = mockFetchAdmins.mock.calls.length;

    // 비활성화 버튼 클릭 → 다이얼로그 열기
    await user.click(screen.getByText('admins.deactivate.action'));

    // 다이얼로그가 열린 후 확인 버튼 클릭
    await waitFor(() => {
      expect(screen.getByText('admins.deactivate.confirmTitle')).toBeInTheDocument();
    });

    const allActionBtns = screen.getAllByText('admins.deactivate.action');
    // 다이얼로그의 확인 버튼 = 마지막 요소 (행의 버튼 다음에 다이얼로그 버튼 렌더링)
    await user.click(allActionBtns[allActionBtns.length - 1]);

    await waitFor(() => {
      expect(mockDeactivateAdmin).toHaveBeenCalledWith('555555555555555555');
    });

    // deactivateAdmin 이후 재조회가 추가로 발생했는지 확인
    await waitFor(() => {
      expect(mockFetchAdmins.mock.calls.length).toBeGreaterThan(callCountAfterLoad);
    });
  });

  it('비활성화 다이얼로그 취소 시 deactivateAdmin이 호출되지 않는다', async () => {
    const user = userEvent.setup();
    const admin = makeAdminUser({
      discordUserId: '555555555555555555',
      isActive: true,
    });
    mockFetchAdmins.mockResolvedValue([admin]);

    render(<AdminsPage />);

    await waitFor(() => {
      expect(screen.getByText('555555555555555555')).toBeInTheDocument();
    });

    await user.click(screen.getByText('admins.deactivate.action'));
    await user.click(screen.getByText('admins.deactivate.cancel'));

    expect(mockDeactivateAdmin).not.toHaveBeenCalled();
    // 다이얼로그가 닫혀야 함
    expect(screen.queryByText('admins.deactivate.confirmTitle')).not.toBeInTheDocument();
  });

  it('비활성화 API 에러 시 에러 메시지가 표시된다', async () => {
    const user = userEvent.setup();
    const admin = makeAdminUser({
      discordUserId: '555555555555555555',
      isActive: true,
    });
    mockFetchAdmins.mockResolvedValue([admin]);
    mockDeactivateAdmin.mockRejectedValue(
      new ApiError(HTTP_STATUS_BAD_REQUEST, '마지막 super_admin'),
    );

    render(<AdminsPage />);

    await waitFor(() => {
      expect(screen.getByText('555555555555555555')).toBeInTheDocument();
    });

    await user.click(screen.getByText('admins.deactivate.action'));

    await waitFor(() => {
      expect(screen.getByText('admins.deactivate.confirmTitle')).toBeInTheDocument();
    });

    const allActionBtns = screen.getAllByText('admins.deactivate.action');
    await user.click(allActionBtns[allActionBtns.length - 1]);

    await waitFor(() => {
      expect(screen.getByText('admins.error.lastSuperAdmin')).toBeInTheDocument();
    });
  });

  it('자기 자신의 비활성화 버튼은 비활성화된다 (UF-009)', async () => {
    const admin = makeAdminUser({
      discordUserId: CURRENT_DISCORD_ID, // 현재 사용자
      isActive: true,
    });
    mockFetchAdmins.mockResolvedValue([admin]);

    render(<AdminsPage />);

    await waitFor(() => {
      expect(screen.getByText(CURRENT_DISCORD_ID)).toBeInTheDocument();
      // "(나)" 표시
      expect(screen.getByText('(나)')).toBeInTheDocument();
    });

    const deactivateBtn = screen.getByText('admins.deactivate.action');
    expect(deactivateBtn).toBeDisabled();
  });
});
