import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../../auth/infrastructure/jwt-auth.guard';
import { MemberSearchService } from '../application/member-search.service';
import { MemberSearchResultDto } from '../dto/member-search-result.dto';

@Controller('api/guilds/:guildId/members')
@UseGuards(JwtAuthGuard)
export class MemberSearchController {
  constructor(private readonly memberSearchService: MemberSearchService) {}

  /**
   * GET /api/guilds/:guildId/members/search?q=키워드
   * F-VOICE-019: voice_daily userName LIKE 검색
   */
  @Get('search')
  async search(
    @Param('guildId') guildId: string,
    @Query('q') q: string,
  ): Promise<MemberSearchResultDto[]> {
    if (!q || q.trim().length === 0) {
      throw new BadRequestException('q 파라미터는 필수입니다');
    }
    return this.memberSearchService.search(guildId, q.trim());
  }

  /**
   * GET /api/guilds/:guildId/members/profiles?ids=id1,id2,...
   * 유저 프로필 일괄 조회 (최대 50명)
   */
  @Get('profiles')
  async getProfiles(
    @Param('guildId') guildId: string,
    @Query('ids') ids: string,
  ): Promise<Record<string, { userName: string; avatarUrl: string | null }>> {
    if (!ids || ids.trim().length === 0) {
      throw new BadRequestException('ids 파라미터는 필수입니다');
    }
    const userIds = ids.split(',').slice(0, 50);
    return this.memberSearchService.getProfiles(guildId, userIds);
  }

  /**
   * GET /api/guilds/:guildId/members/:userId/profile
   * 유저 프로필 조회 (닉네임 + 아바타 URL)
   */
  @Get(':userId/profile')
  async getProfile(
    @Param('guildId') guildId: string,
    @Param('userId') userId: string,
  ): Promise<{ userId: string; userName: string; avatarUrl: string | null }> {
    const profile = await this.memberSearchService.getProfile(guildId, userId);
    if (!profile) {
      throw new NotFoundException('해당 유저를 찾을 수 없습니다');
    }
    return profile;
  }
}
