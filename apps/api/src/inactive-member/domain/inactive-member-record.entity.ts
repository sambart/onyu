import { type InactiveMemberClassifyParams, InactiveMemberGrade } from './inactive-member.types';

export { InactiveMemberGrade };

export interface InactiveMemberRecordProps {
  id?: number;
  guildId: string;
  userId: string;
  nickName: string | null;
  grade: InactiveMemberGrade | null;
  totalMinutes: number;
  prevTotalMinutes: number;
  lastVoiceDate: string | null;
  gradeChangedAt: Date | null;
  classifiedAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * 비활동 회원 분류 레코드.
 * 등급 분류 규칙을 캡슐화한다.
 */
export class InactiveMemberRecord {
  readonly id?: number;
  readonly guildId: string;
  readonly userId: string;
  nickName: string | null;
  grade: InactiveMemberGrade | null;
  totalMinutes: number;
  prevTotalMinutes: number;
  lastVoiceDate: string | null;
  gradeChangedAt: Date | null;
  classifiedAt: Date;
  createdAt?: Date;
  updatedAt?: Date;

  private constructor(props: InactiveMemberRecordProps) {
    this.id = props.id;
    this.guildId = props.guildId;
    this.userId = props.userId;
    this.nickName = props.nickName;
    this.grade = props.grade;
    this.totalMinutes = props.totalMinutes;
    this.prevTotalMinutes = props.prevTotalMinutes;
    this.lastVoiceDate = props.lastVoiceDate;
    this.gradeChangedAt = props.gradeChangedAt;
    this.classifiedAt = props.classifiedAt;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static reconstitute(props: InactiveMemberRecordProps): InactiveMemberRecord {
    return new InactiveMemberRecord(props);
  }

  static create(guildId: string, userId: string, nickName: string | null): InactiveMemberRecord {
    return new InactiveMemberRecord({
      guildId,
      userId,
      nickName,
      grade: null,
      totalMinutes: 0,
      prevTotalMinutes: 0,
      lastVoiceDate: null,
      gradeChangedAt: null,
      classifiedAt: new Date(),
    });
  }

  /** 활동 데이터를 기반으로 비활동 등급을 분류한다 */
  classify(
    totalMinutes: number,
    prevTotalMinutes: number,
    lastVoiceDate: string | null,
    config: InactiveMemberClassifyParams,
  ): void {
    const prevGrade = this.grade;

    this.totalMinutes = totalMinutes;
    this.prevTotalMinutes = prevTotalMinutes;
    this.lastVoiceDate = lastVoiceDate;
    this.grade = this.determineGrade(config);
    this.classifiedAt = new Date();

    if (this.grade !== prevGrade) {
      this.gradeChangedAt = new Date();
    }
  }

  private determineGrade(config: InactiveMemberClassifyParams): InactiveMemberGrade | null {
    if (this.totalMinutes === 0) return InactiveMemberGrade.FULLY_INACTIVE;

    if (this.totalMinutes < config.lowActiveThresholdMin) {
      return InactiveMemberGrade.LOW_ACTIVE;
    }

    if (this.prevTotalMinutes > 0) {
      const declineRatio =
        ((this.prevTotalMinutes - this.totalMinutes) / this.prevTotalMinutes) * 100;
      if (declineRatio >= config.decliningPercent) {
        return InactiveMemberGrade.DECLINING;
      }
    }

    return null;
  }

  get isInactive(): boolean {
    return this.grade !== null;
  }
}
