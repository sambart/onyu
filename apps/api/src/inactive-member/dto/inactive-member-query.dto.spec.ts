import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { InactiveMemberQueryDto } from './inactive-member-query.dto';

describe('InactiveMemberQueryDto', () => {
  describe('sortBy', () => {
    it('sortBy가 미전달이면 유효성 검증 통과', async () => {
      const dto = plainToInstance(InactiveMemberQueryDto, {});
      const errors = await validate(dto);
      const field = errors.find((e) => e.property === 'sortBy');
      expect(field).toBeUndefined();
    });

    it("sortBy='lastVoiceDate'이면 유효성 검증 통과", async () => {
      const dto = plainToInstance(InactiveMemberQueryDto, { sortBy: 'lastVoiceDate' });
      const errors = await validate(dto);
      const field = errors.find((e) => e.property === 'sortBy');
      expect(field).toBeUndefined();
    });

    it("sortBy='totalMinutes'이면 유효성 검증 통과", async () => {
      const dto = plainToInstance(InactiveMemberQueryDto, { sortBy: 'totalMinutes' });
      const errors = await validate(dto);
      const field = errors.find((e) => e.property === 'sortBy');
      expect(field).toBeUndefined();
    });

    it("sortBy='decreaseRate'이면 유효성 검증 통과 (F-INACTIVE-002 신규 허용 값)", async () => {
      const dto = plainToInstance(InactiveMemberQueryDto, { sortBy: 'decreaseRate' });
      const errors = await validate(dto);
      const field = errors.find((e) => e.property === 'sortBy');
      expect(field).toBeUndefined();
    });

    it("sortBy='invalid'이면 유효성 검증 실패 (IsIn 제약)", async () => {
      const dto = plainToInstance(InactiveMemberQueryDto, { sortBy: 'invalid' });
      const errors = await validate(dto);
      const field = errors.find((e) => e.property === 'sortBy');
      expect(field).toBeDefined();
      expect(field?.constraints).toHaveProperty('isIn');
    });

    it("sortBy='prevTotalMinutes'이면 유효성 검증 실패 (허용 목록 외 값)", async () => {
      const dto = plainToInstance(InactiveMemberQueryDto, { sortBy: 'prevTotalMinutes' });
      const errors = await validate(dto);
      const field = errors.find((e) => e.property === 'sortBy');
      expect(field).toBeDefined();
      expect(field?.constraints).toHaveProperty('isIn');
    });

    it("sortBy='gradeChangedAt'이면 유효성 검증 실패 (허용 목록 외 값)", async () => {
      const dto = plainToInstance(InactiveMemberQueryDto, { sortBy: 'gradeChangedAt' });
      const errors = await validate(dto);
      const field = errors.find((e) => e.property === 'sortBy');
      expect(field).toBeDefined();
      expect(field?.constraints).toHaveProperty('isIn');
    });
  });

  describe('grade', () => {
    it("grade='FULLY_INACTIVE'이면 유효성 검증 통과", async () => {
      const dto = plainToInstance(InactiveMemberQueryDto, { grade: 'FULLY_INACTIVE' });
      const errors = await validate(dto);
      const field = errors.find((e) => e.property === 'grade');
      expect(field).toBeUndefined();
    });

    it("grade='LOW_ACTIVE'이면 유효성 검증 통과", async () => {
      const dto = plainToInstance(InactiveMemberQueryDto, { grade: 'LOW_ACTIVE' });
      const errors = await validate(dto);
      const field = errors.find((e) => e.property === 'grade');
      expect(field).toBeUndefined();
    });

    it("grade='DECLINING'이면 유효성 검증 통과", async () => {
      const dto = plainToInstance(InactiveMemberQueryDto, { grade: 'DECLINING' });
      const errors = await validate(dto);
      const field = errors.find((e) => e.property === 'grade');
      expect(field).toBeUndefined();
    });

    it("grade='UNKNOWN'이면 유효성 검증 실패", async () => {
      const dto = plainToInstance(InactiveMemberQueryDto, { grade: 'UNKNOWN' });
      const errors = await validate(dto);
      const field = errors.find((e) => e.property === 'grade');
      expect(field).toBeDefined();
      expect(field?.constraints).toHaveProperty('isIn');
    });
  });

  describe('sortOrder', () => {
    it("sortOrder='ASC'이면 유효성 검증 통과", async () => {
      const dto = plainToInstance(InactiveMemberQueryDto, { sortOrder: 'ASC' });
      const errors = await validate(dto);
      const field = errors.find((e) => e.property === 'sortOrder');
      expect(field).toBeUndefined();
    });

    it("sortOrder='DESC'이면 유효성 검증 통과", async () => {
      const dto = plainToInstance(InactiveMemberQueryDto, { sortOrder: 'DESC' });
      const errors = await validate(dto);
      const field = errors.find((e) => e.property === 'sortOrder');
      expect(field).toBeUndefined();
    });

    it("sortOrder='asc'이면 유효성 검증 실패 (대소문자 구분)", async () => {
      const dto = plainToInstance(InactiveMemberQueryDto, { sortOrder: 'asc' });
      const errors = await validate(dto);
      const field = errors.find((e) => e.property === 'sortOrder');
      expect(field).toBeDefined();
    });
  });
});
