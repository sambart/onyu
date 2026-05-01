import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { NewbieConfigSaveDto } from './newbie-config-save.dto';

/** 유효성 검증 통과에 필요한 최소 필수 필드 */
function makeMinimalDto(overrides: Record<string, unknown> = {}): NewbieConfigSaveDto {
  return plainToInstance(NewbieConfigSaveDto, {
    welcomeEnabled: false,
    missionEnabled: false,
    mocoEnabled: false,
    roleEnabled: false,
    ...overrides,
  });
}

describe('NewbieConfigSaveDto', () => {
  describe('missionUseMicTime', () => {
    it('missionUseMicTime이 미전달(undefined)이면 유효성 검증 통과', async () => {
      const dto = makeMinimalDto(); // missionUseMicTime 없음
      const errors = await validate(dto);
      const field = errors.find((e) => e.property === 'missionUseMicTime');
      expect(field).toBeUndefined();
    });

    it('missionUseMicTime=true이면 유효성 검증 통과', async () => {
      const dto = makeMinimalDto({ missionUseMicTime: true });
      const errors = await validate(dto);
      const field = errors.find((e) => e.property === 'missionUseMicTime');
      expect(field).toBeUndefined();
    });

    it('missionUseMicTime=false이면 유효성 검증 통과', async () => {
      const dto = makeMinimalDto({ missionUseMicTime: false });
      const errors = await validate(dto);
      const field = errors.find((e) => e.property === 'missionUseMicTime');
      expect(field).toBeUndefined();
    });

    it('missionUseMicTime이 string "true"이면 유효성 검증 실패 (IsBoolean)', async () => {
      const dto = makeMinimalDto({ missionUseMicTime: 'true' });
      const errors = await validate(dto);
      const field = errors.find((e) => e.property === 'missionUseMicTime');
      expect(field).toBeDefined();
      expect(field?.constraints).toHaveProperty('isBoolean');
    });

    it('missionUseMicTime이 숫자 1이면 유효성 검증 실패 (IsBoolean)', async () => {
      const dto = makeMinimalDto({ missionUseMicTime: 1 });
      const errors = await validate(dto);
      const field = errors.find((e) => e.property === 'missionUseMicTime');
      expect(field).toBeDefined();
      expect(field?.constraints).toHaveProperty('isBoolean');
    });

    it('missionUseMicTime이 string "false"이면 유효성 검증 실패 (IsBoolean)', async () => {
      const dto = makeMinimalDto({ missionUseMicTime: 'false' });
      const errors = await validate(dto);
      const field = errors.find((e) => e.property === 'missionUseMicTime');
      expect(field).toBeDefined();
      expect(field?.constraints).toHaveProperty('isBoolean');
    });
  });

  describe('필수 boolean 필드', () => {
    it('welcomeEnabled가 없으면 유효성 검증 실패', async () => {
      const dto = plainToInstance(NewbieConfigSaveDto, {
        missionEnabled: false,
        mocoEnabled: false,
        roleEnabled: false,
      });
      const errors = await validate(dto);
      const field = errors.find((e) => e.property === 'welcomeEnabled');
      expect(field).toBeDefined();
    });

    it('missionEnabled가 없으면 유효성 검증 실패', async () => {
      const dto = plainToInstance(NewbieConfigSaveDto, {
        welcomeEnabled: false,
        mocoEnabled: false,
        roleEnabled: false,
      });
      const errors = await validate(dto);
      const field = errors.find((e) => e.property === 'missionEnabled');
      expect(field).toBeDefined();
    });
  });
});
