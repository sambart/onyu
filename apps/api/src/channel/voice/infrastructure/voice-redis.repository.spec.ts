import { MockRedisService } from '../../../test-utils/mock-redis.service';
import { VoiceKeys } from './voice-cache.keys';
import { VoiceRedisRepository } from './voice-redis.repository';
import { type VoiceSession } from './voice-session.keys';

const SESSION_JOINED_AGO_MS = 10_000; // 10초 전
const SESSION_UPDATED_AGO_MS = 5_000; // 5초 전
const TEST_ELAPSED_MS = 10_000; // 테스트 경과 시간 (10초)

function makeSession(overrides: Partial<VoiceSession> = {}): VoiceSession {
  return {
    channelId: 'ch-1',
    joinedAt: Date.now() - SESSION_JOINED_AGO_MS,
    mic: true,
    alone: false,
    lastUpdatedAt: Date.now() - SESSION_UPDATED_AGO_MS,
    date: '20260316',
    streaming: false,
    videoOn: false,
    selfDeaf: false,
    ...overrides,
  };
}

describe('VoiceRedisRepository.accumulateDuration', () => {
  let repo: VoiceRedisRepository;
  let redis: MockRedisService;

  const guild = 'guild-1';
  const user = 'user-1';

  beforeEach(() => {
    redis = new MockRedisService();
    // MockRedisService의 pipeline은 실제 카운터를 올리지 않으므로,
    // pipeline 메서드를 실제 동작하도록 오버라이드한다
    redis.pipeline = vi
      .fn()
      .mockImplementation(
        async (build: (pipe: Record<string, (key: string, val: number) => void>) => void) => {
          const pipe = {
            incrby: vi.fn((key: string, val: number) => void redis.incrBy(key, val)),
            set: vi.fn(),
          };
          build(pipe as never);
          return [];
        },
      );

    repo = new VoiceRedisRepository(redis as never);
  });

  afterEach(() => {
    redis.clear();
  });

  it('streaming=true이면 streamingDuration 키에 시간을 누적한다', async () => {
    const now = Date.now();
    const session = makeSession({
      streaming: true,
      lastUpdatedAt: now - TEST_ELAPSED_MS, // 10초 전
      date: '20260316',
    });

    await repo.accumulateDuration(guild, user, session, now);

    const key = VoiceKeys.streamingDuration(guild, user, '20260316');
    const value = await redis.get<string>(key);
    expect(Number(value)).toBeGreaterThan(0);
  });

  it('streaming=false이면 streamingDuration 키에 시간을 누적하지 않는다', async () => {
    const now = Date.now();
    const session = makeSession({
      streaming: false,
      lastUpdatedAt: now - TEST_ELAPSED_MS,
      date: '20260316',
    });

    await repo.accumulateDuration(guild, user, session, now);

    const key = VoiceKeys.streamingDuration(guild, user, '20260316');
    const value = await redis.get<string>(key);
    expect(value).toBeNull();
  });

  it('videoOn=true이면 videoDuration 키에 시간을 누적한다', async () => {
    const now = Date.now();
    const session = makeSession({
      videoOn: true,
      lastUpdatedAt: now - TEST_ELAPSED_MS,
      date: '20260316',
    });

    await repo.accumulateDuration(guild, user, session, now);

    const key = VoiceKeys.videoDuration(guild, user, '20260316');
    const value = await redis.get<string>(key);
    expect(Number(value)).toBeGreaterThan(0);
  });

  it('videoOn=false이면 videoDuration 키에 시간을 누적하지 않는다', async () => {
    const now = Date.now();
    const session = makeSession({
      videoOn: false,
      lastUpdatedAt: now - TEST_ELAPSED_MS,
      date: '20260316',
    });

    await repo.accumulateDuration(guild, user, session, now);

    const key = VoiceKeys.videoDuration(guild, user, '20260316');
    const value = await redis.get<string>(key);
    expect(value).toBeNull();
  });

  it('selfDeaf=true이면 deafDuration 키에 시간을 누적한다', async () => {
    const now = Date.now();
    const session = makeSession({
      selfDeaf: true,
      lastUpdatedAt: now - TEST_ELAPSED_MS,
      date: '20260316',
    });

    await repo.accumulateDuration(guild, user, session, now);

    const key = VoiceKeys.deafDuration(guild, user, '20260316');
    const value = await redis.get<string>(key);
    expect(Number(value)).toBeGreaterThan(0);
  });

  it('selfDeaf=false이면 deafDuration 키에 시간을 누적하지 않는다', async () => {
    const now = Date.now();
    const session = makeSession({
      selfDeaf: false,
      lastUpdatedAt: now - TEST_ELAPSED_MS,
      date: '20260316',
    });

    await repo.accumulateDuration(guild, user, session, now);

    const key = VoiceKeys.deafDuration(guild, user, '20260316');
    const value = await redis.get<string>(key);
    expect(value).toBeNull();
  });

  it('lastUpdatedAt이 없으면 아무것도 누적하지 않는다', async () => {
    const now = Date.now();
    const session: VoiceSession = {
      ...makeSession({ streaming: true, videoOn: true, selfDeaf: true }),
      lastUpdatedAt: 0, // falsy
    };

    await repo.accumulateDuration(guild, user, session, now);

    const streamKey = VoiceKeys.streamingDuration(guild, user, '20260316');
    expect(await redis.get(streamKey)).toBeNull();
  });

  it('elapsedSeconds <= 0이면 아무것도 누적하지 않는다', async () => {
    const now = Date.now();
    const session = makeSession({
      streaming: true,
      lastUpdatedAt: now + 1000, // 미래 시점 (elapsedSeconds < 0)
      date: '20260316',
    });

    await repo.accumulateDuration(guild, user, session, now);

    const streamKey = VoiceKeys.streamingDuration(guild, user, '20260316');
    expect(await redis.get(streamKey)).toBeNull();
  });

  it('기존 channelDuration 누적도 계속 동작한다 (회귀 검증)', async () => {
    const now = Date.now();
    const session = makeSession({
      streaming: false,
      lastUpdatedAt: now - TEST_ELAPSED_MS,
      date: '20260316',
    });

    const mockPipeline = vi.fn().mockResolvedValue([]);
    redis.pipeline = mockPipeline;

    await repo.accumulateDuration(guild, user, session, now);

    // pipeline이 호출되어야 함
    expect(mockPipeline).toHaveBeenCalled();
  });
});

describe('VoiceRedisRepository — 세션 CRUD', () => {
  let repo: VoiceRedisRepository;
  let redis: MockRedisService;

  const guild = 'guild-1';
  const user = 'user-1';

  beforeEach(() => {
    redis = new MockRedisService();
    repo = new VoiceRedisRepository(redis as never);
  });

  afterEach(() => {
    redis.clear();
  });

  it('setSession으로 저장한 세션을 getSession으로 조회할 수 있다', async () => {
    const session = makeSession();
    await repo.setSession(guild, user, session);

    const result = await repo.getSession(guild, user);
    expect(result).toEqual(session);
  });

  it('세션이 없으면 getSession은 null을 반환한다', async () => {
    const result = await repo.getSession(guild, user);
    expect(result).toBeNull();
  });

  it('deleteSession 후 getSession은 null을 반환한다', async () => {
    const session = makeSession();
    await repo.setSession(guild, user, session);
    await repo.deleteSession(guild, user);

    const result = await repo.getSession(guild, user);
    expect(result).toBeNull();
  });

  it('세션에 streaming/videoOn/selfDeaf 필드가 보존된다', async () => {
    const session = makeSession({ streaming: true, videoOn: true, selfDeaf: true });
    await repo.setSession(guild, user, session);

    const result = await repo.getSession(guild, user);
    expect(result?.streaming).toBe(true);
    expect(result?.videoOn).toBe(true);
    expect(result?.selfDeaf).toBe(true);
  });
});
