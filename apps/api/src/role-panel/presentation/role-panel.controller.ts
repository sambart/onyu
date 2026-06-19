import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../auth/infrastructure/jwt-auth.guard';
import { RolePanelConfigService } from '../application/role-panel-config.service';
import { CreateRolePanelDto } from './create-role-panel.dto';
import type { AssignableRoleDto, RolePanelDto } from './role-panel-response.dto';
import { UpdateRolePanelDto } from './update-role-panel.dto';

@Controller('api/guilds/:guildId/role-panel')
@UseGuards(JwtAuthGuard)
export class RolePanelController {
  constructor(private readonly configService: RolePanelConfigService) {}

  /**
   * GET /api/guilds/:guildId/role-panel
   * 길드 패널 목록 조회 (캐시 우선).
   */
  @Get()
  async getPanels(@Param('guildId') guildId: string): Promise<RolePanelDto[]> {
    return this.configService.getConfigs(guildId);
  }

  /**
   * GET /api/guilds/:guildId/role-panel/assignable-roles
   * 부여 가능 역할 목록 + 비활성 메타 조회.
   * 주의: /:panelId 보다 위에 선언해야 'assignable-roles'가 ParseIntPipe에 걸리지 않는다.
   */
  @Get('assignable-roles')
  async getAssignableRoles(@Param('guildId') guildId: string): Promise<AssignableRoleDto[]> {
    return this.configService.getAssignableRoles(guildId);
  }

  /**
   * GET /api/guilds/:guildId/role-panel/:panelId
   * 패널 단건 상세 조회 (guildId 소유 검증).
   */
  @Get(':panelId')
  async getPanel(
    @Param('guildId') guildId: string,
    @Param('panelId', ParseIntPipe) panelId: number,
  ): Promise<RolePanelDto> {
    return this.configService.getConfig(guildId, panelId);
  }

  /**
   * POST /api/guilds/:guildId/role-panel
   * 패널 생성 (published=false). 역할 검증 포함.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createPanel(
    @Param('guildId') guildId: string,
    @Body() dto: CreateRolePanelDto,
  ): Promise<RolePanelDto> {
    return this.configService.createConfig(guildId, dto);
  }

  /**
   * PUT /api/guilds/:guildId/role-panel/:panelId
   * 패널 수정 (버튼 전체 replace). published=true면 Discord 동기화.
   */
  @Put(':panelId')
  @HttpCode(HttpStatus.OK)
  async updatePanel(
    @Param('guildId') guildId: string,
    @Param('panelId', ParseIntPipe) panelId: number,
    @Body() dto: UpdateRolePanelDto,
  ): Promise<RolePanelDto> {
    return this.configService.updateConfig(guildId, panelId, dto);
  }

  /**
   * DELETE /api/guilds/:guildId/role-panel/:panelId
   * 패널 삭제 + Discord 메시지 삭제(실패 무시).
   */
  @Delete(':panelId')
  @HttpCode(HttpStatus.OK)
  async deletePanel(
    @Param('guildId') guildId: string,
    @Param('panelId', ParseIntPipe) panelId: number,
  ): Promise<{ ok: boolean }> {
    await this.configService.deleteConfig(guildId, panelId);
    return { ok: true };
  }

  /**
   * POST /api/guilds/:guildId/role-panel/:panelId/publish
   * 패널 게시 / 재동기화. channelId 필수 검증.
   */
  @Post(':panelId/publish')
  @HttpCode(HttpStatus.OK)
  async publishPanel(
    @Param('guildId') guildId: string,
    @Param('panelId', ParseIntPipe) panelId: number,
  ): Promise<RolePanelDto> {
    return this.configService.publishConfig(guildId, panelId);
  }
}
