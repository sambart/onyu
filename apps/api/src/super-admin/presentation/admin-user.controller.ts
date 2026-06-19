import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import { JwtAuthGuard } from '../../auth/infrastructure/jwt-auth.guard';
import { AdminUserService } from '../application/admin-user.service';
import { AdminUserResponseDto, CreateAdminDto, UpdateAdminRoleDto } from '../dto/admin-user.dto';
import { RequireScope } from '../guards/require-scope.decorator';
import { RequireScopeGuard } from '../guards/require-scope.guard';
import { SuperAdminGuard } from '../guards/super-admin.guard';
import type { AdminUserOrmEntity } from '../infrastructure/admin-user.orm-entity';

@Controller('api/admin')
@UseGuards(JwtAuthGuard, SuperAdminGuard, RequireScopeGuard)
@RequireScope('admin:manage')
export class AdminUserController {
  constructor(private readonly adminUserService: AdminUserService) {}

  @Get('admins')
  async listAdmins(
    @Query('activeOnly') activeOnly?: string,
  ): Promise<{ admins: AdminUserResponseDto[] }> {
    const isActiveOnly = activeOnly === 'true';
    const admins = await this.adminUserService.listAdmins(isActiveOnly);
    return { admins: admins.map((a) => this.toResponse(a)) };
  }

  @Post('admins')
  @HttpCode(HttpStatus.CREATED)
  async addAdmin(@Body() body: CreateAdminDto, @Req() req: Request): Promise<AdminUserResponseDto> {
    // JwtAuthGuard + jwt.strategy.ts validate()가 discordId를 보장하므로 단언 안전.
    const requester = req.user as { discordId: string } | undefined;
    const grantedBy = requester?.discordId ?? 'unknown';
    const created = await this.adminUserService.addAdmin(
      { discordUserId: body.discordUserId, role: body.role },
      grantedBy,
    );
    return this.toResponse(created);
  }

  @Patch('admins/:discordUserId')
  async updateAdminRole(
    @Param('discordUserId') discordUserId: string,
    @Body() body: UpdateAdminRoleDto,
  ): Promise<AdminUserResponseDto> {
    const updated = await this.adminUserService.updateAdminRole(discordUserId, body.role);
    return this.toResponse(updated);
  }

  @Delete('admins/:discordUserId')
  @HttpCode(HttpStatus.OK)
  async deactivateAdmin(
    @Param('discordUserId') discordUserId: string,
    @Req() req: Request,
  ): Promise<{ success: boolean }> {
    // JwtAuthGuard + jwt.strategy.ts validate()가 discordId를 보장하므로 단언 안전.
    const requester = req.user as { discordId: string } | undefined;
    const requestingDiscordId = requester?.discordId ?? '';
    await this.adminUserService.deactivateAdmin(discordUserId, requestingDiscordId);
    return { success: true };
  }

  private toResponse(entity: AdminUserOrmEntity): AdminUserResponseDto {
    return new AdminUserResponseDto({
      discordUserId: entity.discordUserId,
      role: entity.role,
      grantedBy: entity.grantedBy,
      isActive: entity.isActive,
      createdAt: entity.createdAt,
    });
  }
}
