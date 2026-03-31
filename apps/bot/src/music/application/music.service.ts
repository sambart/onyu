import { Injectable } from '@nestjs/common';
import type { KazagumoPlayer, KazagumoSearchResult, KazagumoTrack } from 'kazagumo';

import { KazagumoProvider } from '../infrastructure/kazagumo.provider';
import { DEFAULT_VOLUME } from '../music.constants';

interface PlayResult {
  player: KazagumoPlayer;
  isPlaylist: boolean;
  isQueued: boolean;
  trackCount: number;
  /** 첫 번째 트랙 (Embed 표시용) */
  firstTrack: KazagumoTrack;
}

@Injectable()
export class MusicService {
  constructor(private readonly kazagumoProvider: KazagumoProvider) {}

  /**
   * 트랙 검색 후 큐에 추가하고 재생을 시작한다.
   * 플레이리스트 URL이면 전체 트랙을 일괄 추가한다.
   */
  async play(params: {
    query: string;
    guildId: string;
    textChannelId: string;
    voiceChannelId: string;
    requesterId: string;
  }): Promise<PlayResult> {
    const kazagumo = this.kazagumoProvider.getInstance();

    const result: KazagumoSearchResult = await kazagumo.search(params.query, {
      requester: { id: params.requesterId },
    });

    if (!result.tracks.length) {
      throw new Error('Track not found');
    }

    // 기존 플레이어가 있으면 재사용, 없으면 생성
    let player = kazagumo.players.get(params.guildId);
    if (!player) {
      player = await kazagumo.createPlayer({
        guildId: params.guildId,
        textId: params.textChannelId,
        voiceId: params.voiceChannelId,
        volume: DEFAULT_VOLUME,
      });
    }

    const isPlaylist = result.type === 'PLAYLIST';

    if (isPlaylist) {
      // 플레이리스트: 전체 트랙 일괄 추가
      for (const track of result.tracks) {
        player.queue.add(track);
      }
    } else {
      player.queue.add(result.tracks[0]);
    }

    const isQueued = player.playing || player.paused;

    if (!isQueued) {
      await player.play();
    }

    return {
      player,
      isPlaylist,
      isQueued,
      trackCount: isPlaylist ? result.tracks.length : 1,
      firstTrack: result.tracks[0],
    };
  }

  /** 현재 트랙을 건너뛰고 다음 트랙을 재생한다. */
  async skip(
    guildId: string,
  ): Promise<{ player: KazagumoPlayer; nextTrack: KazagumoTrack | null }> {
    const player = this.getPlayerOrThrow(guildId);
    // skip 전에 큐의 다음 트랙을 미리 확인 (skip 후 current가 갱신되지 않을 수 있음)
    const nextTrack = player.queue[0] ?? null;
    await player.skip();
    if (nextTrack && !player.playing) {
      await player.play();
    }
    return { player, nextTrack };
  }

  /** 재생을 중지하고 큐를 초기화하며 채널에서 퇴장한다. */
  stop(guildId: string): void {
    const kazagumo = this.kazagumoProvider.getInstance();
    // stop은 큐가 비어있어도 player가 존재하면 퇴장 가능하므로 직접 조회
    const player = kazagumo.players.get(guildId);
    if (!player) {
      throw new Error('No active player');
    }
    player.queue.clear();
    kazagumo.destroyPlayer(guildId);
  }

  /** 현재 트랙을 일시정지한다. */
  pause(guildId: string): KazagumoPlayer {
    const player = this.getPlayerOrThrow(guildId);
    if (player.paused) {
      throw new Error('Already paused');
    }
    player.pause(true);
    return player;
  }

  /** 일시정지된 트랙을 재개한다. */
  resume(guildId: string): KazagumoPlayer {
    const player = this.getPlayerOrThrow(guildId);
    if (!player.paused) {
      throw new Error('Not paused');
    }
    player.pause(false);
    return player;
  }

  /**
   * 여러 검색어를 순차 검색하여 큐에 일괄 추가한다.
   * @returns 성공적으로 추가된 트랙 수
   */
  async playBulk(params: {
    queries: string[];
    guildId: string;
    textChannelId: string;
    voiceChannelId: string;
    requesterId: string;
  }): Promise<number> {
    let addedCount = 0;

    for (const query of params.queries) {
      try {
        await this.play({
          query,
          guildId: params.guildId,
          textChannelId: params.textChannelId,
          voiceChannelId: params.voiceChannelId,
          requesterId: params.requesterId,
        });
        addedCount++;
      } catch {
        // 개별 트랙 검색 실패 시 건너뛰기
      }
    }

    return addedCount;
  }

  /** Kazagumo 인스턴스를 반환한다 (버튼 핸들러의 player 직접 접근용). */
  getKazagumo(): ReturnType<KazagumoProvider['getInstance']> {
    return this.kazagumoProvider.getInstance();
  }

  /** 길드의 플레이어를 조회하고 없으면 예외를 던진다. */
  private getPlayerOrThrow(guildId: string): KazagumoPlayer {
    const kazagumo = this.kazagumoProvider.getInstance();
    const player = kazagumo.players.get(guildId);
    if (!player?.queue.current) {
      throw new Error('No active player');
    }
    return player;
  }
}
