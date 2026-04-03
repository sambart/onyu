import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { GuildMemberService } from './application/guild-member.service';
import { GuildMemberOrmEntity } from './infrastructure/guild-member.orm-entity';
import { GuildMemberRepository } from './infrastructure/guild-member.repository';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([GuildMemberOrmEntity])],
  providers: [GuildMemberService, GuildMemberRepository],
  exports: [GuildMemberService],
})
export class GuildMemberModule {}
