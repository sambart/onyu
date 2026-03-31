import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AiInsightResponse, VoiceActivityData, VoiceAnalysisResult } from '@onyu/shared';

const RECENT_DAYS_SLICE = -7;
const HEALTH_SCORE_GOOD = 70;
const HEALTH_SCORE_FAIR = 40;

import type { LlmProvider } from '../../common/llm/llm-provider.interface';
import { LLM_PROVIDER } from '../../common/llm/llm-provider.interface';
import { getErrorMessage, getErrorStack } from '../../common/util/error.util';

@Injectable()
export class VoiceAiAnalysisService {
  private readonly logger = new Logger(VoiceAiAnalysisService.name);

  constructor(@Inject(LLM_PROVIDER) private readonly llmProvider: LlmProvider) {}

  async analyzeVoiceActivity(activityData: VoiceActivityData): Promise<VoiceAnalysisResult> {
    try {
      const prompt = this.buildVoiceAnalysisPrompt(activityData);

      this.logger.log('Sending voice activity data to LLM...');
      const text = await this.llmProvider.generateText(prompt);

      this.logger.log('Successfully analyzed voice activity');
      return { text };
    } catch (error) {
      this.logger.error('Failed to analyze voice activity after retries', getErrorStack(error));
      return {
        text: this.buildFallbackAnalysis(activityData),
      };
    }
  }

  private buildVoiceAnalysisPrompt(data: VoiceActivityData): string {
    // 데이터 요약 (너무 길면 토큰 초과)
    const summarizedData = {
      guildName: data.guildName,
      timeRange: data.timeRange,
      totalStats: data.totalStats,
      topUsers: data.userActivities.slice(0, 10),
      topChannels: data.channelStats.slice(0, 5),
      recentTrends: data.dailyTrends.slice(RECENT_DAYS_SLICE),
    };

    const timeExplanation = `
      참고: 시간 단위는 초(seconds)입니다.
      - 3600초 = 1시간
      - 86400초 = 1일
      `;

    return `
      당신은 Discord 서버의 음성 채널 활동 분석 전문가입니다.
      다음 데이터를 바탕으로 한국어로 상세하고 유용한 분석 리포트를 작성해주세요.

      ${timeExplanation}

      **음성 채널 활동 데이터:**
      \`\`\`json
      ${JSON.stringify(summarizedData, null, 2)}
      \`\`\`

      **분석 내용에 포함할 것:**
      1. 📊 전체 활동 요약 (2-3문장)
      2. 🔍 주요 인사이트 (3-5개, 구체적인 수치 포함)
      3. 👥 활동적인 유저 분석 (TOP 3-5)
      4. 📺 채널 사용 패턴
      5. 🎤 마이크 사용 패턴
      6. 📈 트렌드 및 변화
      7. 💡 개선 제안 (실행 가능한 것)
      8. ⚠️ 주의사항 (있다면)

      **작성 규칙:**
      - 모든 시간은 "시간", "분" 단위로 변환
      - 이모지를 적절히 사용하여 가독성 향상
      - 구체적인 숫자와 비율 포함
      - 친근하고 이해하기 쉬운 표현 사용
      - 마크다운 형식으로 작성 (##, ###, - 등 사용)
      - 긍정적인 면과 개선점을 균형있게 다루기
      - 3000자 이내로 요약하기
      - discord embed에 붙여야하니 규격을 신경쓰기

      지금 분석을 시작해주세요:`;
  }

  private buildFallbackAnalysis(data: VoiceActivityData): string {
    const formatTime = (seconds: number) => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return hours > 0 ? `${hours}시간 ${minutes}분` : `${minutes}분`;
    };

    const topUsers = data.userActivities
      .slice(0, 5)
      .map((u, i) => `${i + 1}. **${u.username}** — ${formatTime(u.totalVoiceTime)}`)
      .join('\n');

    const topChannels = data.channelStats
      .slice(0, 3)
      .map((c) => `- **${c.channelName}** — ${formatTime(c.totalVoiceTime)} (${c.uniqueUsers}명)`)
      .join('\n');

    return (
      '> AI 분석을 일시적으로 사용할 수 없어 기본 통계를 표시합니다.\n\n' +
      `**📊 전체 통계**\n` +
      `- 총 활성 유저: ${data.totalStats.totalUsers}명\n` +
      `- 총 음성 시간: ${formatTime(data.totalStats.totalVoiceTime)}\n` +
      `- 총 마이크 사용: ${formatTime(data.totalStats.totalMicOnTime)}\n` +
      `- 일평균 활성 유저: ${data.totalStats.avgDailyActiveUsers}명\n\n` +
      `**👥 TOP 5 유저**\n${topUsers || '- 데이터 없음'}\n\n` +
      `**📺 인기 채널**\n${topChannels || '- 데이터 없음'}`
    );
  }

  async analyzeSpecificUser(
    activityData: VoiceActivityData,
    targetUserId: string,
  ): Promise<string> {
    const userActivity = activityData.userActivities.find((u) => u.userId === targetUserId);

    if (!userActivity) {
      throw new Error('User not found in activity data');
    }

    const prompt = `
유저의 음성 채널 활동 패턴을 분석해주세요:

\`\`\`json
${JSON.stringify(userActivity, null, 2)}
\`\`\`

다음 형식으로 분석 결과를 작성해주세요:

**🎯 활동 수준:** [높음/보통/낮음]

**👤 활동 성향:**
[이 유저의 활동 패턴과 특징 설명]

**💪 강점:**
- [강점 1]
- [강점 2]

**⚠️ 주의사항:**
- [있다면 작성]

**💡 제안:**
- [제안 1]
- [제안 2]

간결하고 명확하게 작성해주세요.
`;

    try {
      return await this.llmProvider.generateText(prompt);
    } catch (error) {
      this.logger.error('Failed to analyze user after retries', getErrorStack(error));
      const formatTime = (seconds: number) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return hours > 0 ? `${hours}시간 ${minutes}분` : `${minutes}분`;
      };

      return (
        '> AI 분석을 일시적으로 사용할 수 없어 기본 통계를 표시합니다.\n\n' +
        `- 총 음성 시간: ${formatTime(userActivity.totalVoiceTime)}\n` +
        `- 마이크 사용률: ${userActivity.micUsageRate}%\n` +
        `- 활동 일수: ${userActivity.activeDays}일\n` +
        `- 자주 사용 채널: ${
          userActivity.activeChannels
            .slice(0, 3)
            .map((c) => c.channelName)
            .join(', ') || '없음'
        }`
      );
    }
  }

  async generateHealthDiagnosis(
    score: number,
    totalStats: VoiceActivityData['totalStats'],
    dailyTrends: VoiceActivityData['dailyTrends'],
  ): Promise<string> {
    const prompt = `
Discord 서버 음성 채널 건강도 점수: ${score}점 (0~100점)

총 활성 유저: ${totalStats.totalUsers}명
총 음성 시간: ${Math.floor(totalStats.totalVoiceTime / 3600)}시간
일평균 활성 유저: ${totalStats.avgDailyActiveUsers}명
최근 트렌드 (최대 7일): ${JSON.stringify(dailyTrends.slice(RECENT_DAYS_SLICE))}

위 데이터를 바탕으로 서버 음성 활동 건강도에 대한 진단 텍스트를 2~3문장으로 한국어로 작성해주세요.
점수에 맞는 긍정적/부정적 평가와 핵심 원인을 포함해주세요.
`;

    try {
      return await this.llmProvider.generateText(prompt, { maxOutputTokens: 512 });
    } catch (error) {
      this.logger.error('generateHealthDiagnosis failed', getErrorStack(error));
      const level =
        score >= HEALTH_SCORE_GOOD ? '양호' : score >= HEALTH_SCORE_FAIR ? '보통' : '주의 필요';
      return `서버 건강도 점수는 ${score}점으로 ${level} 상태입니다. 일평균 ${totalStats.avgDailyActiveUsers}명이 음성 채널을 이용하고 있습니다.`;
    }
  }

  async generateAiInsight(activityData: VoiceActivityData): Promise<AiInsightResponse> {
    const summarizedData = {
      guildName: activityData.guildName,
      timeRange: activityData.timeRange,
      totalStats: activityData.totalStats,
      topUsers: activityData.userActivities.slice(0, 5).map((u) => ({
        username: u.username,
        totalVoiceTime: u.totalVoiceTime,
        micUsageRate: u.micUsageRate,
        activeDays: u.activeDays,
      })),
      topChannels: activityData.channelStats.slice(0, 5).map((c) => ({
        channelName: c.channelName,
        totalVoiceTime: c.totalVoiceTime,
        uniqueUsers: c.uniqueUsers,
      })),
      recentTrends: activityData.dailyTrends.slice(RECENT_DAYS_SLICE),
    };

    const prompt = `
Discord 서버 "${summarizedData.guildName}" 음성 채널 활동 데이터를 분석하여 서버 관리자에게 유용한 리포트를 작성해주세요.

데이터:
${JSON.stringify(summarizedData)}

참고: 시간 단위는 초(seconds)입니다. 3600초 = 1시간.

작성 규칙:
- insights는 마크다운 형식으로 1000~1500자 범위로 작성
- 아래 섹션 구조를 따라주세요:

**📊 활동 개요**
기간, 총 활성 유저, 총 음성시간, 일평균 활성유저 등 핵심 지표 요약 (2~3문장)

**📈 트렌드 분석**
일별 활동 추이에서 발견되는 패턴, 증감 추세, 특이한 날짜 등 (2~3문장)

**👥 유저 분석**
상위 활동 유저 특징, 활동 편중도, 마이크 사용 패턴 등 (2~3문장)

**📺 채널 분석**
인기 채널, 채널별 사용 패턴, 유저 분산도 등 (2~3문장)

- suggestions는 데이터에 기반한 구체적이고 실행 가능한 제안 3~5개

다음 JSON 형식으로만 응답하세요:
{"insights": "마크다운 리포트", "suggestions": ["제안1", "제안2", "제안3"]}
`;

    try {
      const text = await this.llmProvider.generateText(prompt, {
        maxOutputTokens: 16384,
        thinkingBudget: 1024,
      });
      return this.parseAiInsightResponse(text);
    } catch (error) {
      this.logger.error('generateAiInsight failed', getErrorStack(error));
      return {
        insights: this.buildFallbackAnalysis(activityData),
        suggestions: ['정기적으로 서버 멤버들을 음성 채널 활동에 초대해보세요.'],
        generatedAt: new Date().toISOString(),
      };
    }
  }

  private parseAiInsightResponse(text: string): AiInsightResponse {
    this.logger.debug(`LLM raw response (first 500 chars): ${text.slice(0, 500)}`);

    // 코드블럭 제거 (```json ... ``` 또는 닫는 ``` 없이 잘린 경우 포함)
    let jsonSource = text;
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/);
    if (codeBlockMatch) {
      jsonSource = codeBlockMatch[1].trim();
    }

    // insights 필드 값을 직접 추출 (JSON이 잘렸어도 insights는 대부분 완전함)
    const insightsMatch = jsonSource.match(/"insights"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    const suggestionsMatch = jsonSource.match(/"suggestions"\s*:\s*\[([\s\S]*?)\]/);

    if (insightsMatch) {
      const insights = insightsMatch[1]
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');

      let suggestions: string[] = [];
      if (suggestionsMatch) {
        const rawSuggestions = suggestionsMatch[1].match(/"((?:[^"\\]|\\.)*)"/g);
        if (rawSuggestions) {
          suggestions = rawSuggestions.map((s) =>
            s.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\'),
          );
        }
      }

      return { insights, suggestions, generatedAt: new Date().toISOString() };
    }

    // 정규식 매칭 실패 시 전체 JSON 파싱 시도
    try {
      const jsonMatch = jsonSource.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as { insights: string; suggestions: string[] };
        return {
          insights: parsed.insights ?? '',
          suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
          generatedAt: new Date().toISOString(),
        };
      }
    } catch {
      this.logger.warn('JSON parse failed, using cleaned text as insights');
    }

    // 최종 fallback: 코드블럭/JSON 문법 제거 후 텍스트만 사용
    const cleanedText = jsonSource
      .replace(/^\s*\{\s*"insights"\s*:\s*"/m, '')
      .replace(/"\s*,?\s*"suggestions"[\s\S]*$/, '')
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .trim();

    return {
      insights: cleanedText || text.trim(),
      suggestions: [],
      generatedAt: new Date().toISOString(),
    };
  }

  async generateBriefSummary(
    totalStats: VoiceActivityData['totalStats'],
    topUsers: VoiceActivityData['userActivities'],
  ): Promise<string> {
    const top3 = topUsers.slice(0, 3);
    const formatTime = (seconds: number) => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return hours > 0 ? `${hours}시간 ${minutes}분` : `${minutes}분`;
    };

    const prompt = `
Discord 서버 음성 채널 활동 요약:
- 총 활성 유저: ${totalStats.totalUsers}명
- 총 음성 시간: ${formatTime(totalStats.totalVoiceTime)}
- 일평균 활성 유저: ${totalStats.avgDailyActiveUsers}명
- TOP 3 유저: ${top3.map((u) => `${u.username}(${formatTime(u.totalVoiceTime)})`).join(', ')}

위 데이터를 2~3문장으로 간결하게 한국어로 요약해주세요. Discord Embed 설명란에 들어갈 텍스트입니다.
`;

    try {
      return await this.llmProvider.generateText(prompt, { maxOutputTokens: 256 });
    } catch (error) {
      this.logger.error('generateBriefSummary failed', getErrorStack(error));
      const formatTime = (seconds: number) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return hours > 0 ? `${hours}시간 ${minutes}분` : `${minutes}분`;
      };
      return `총 ${totalStats.totalUsers}명이 ${formatTime(totalStats.totalVoiceTime)} 동안 음성 채널을 이용했습니다. 일평균 ${totalStats.avgDailyActiveUsers}명이 활동했습니다.`;
    }
  }

  async generateWeeklyReport(
    currentData: VoiceActivityData,
    prevData: VoiceActivityData,
    channelStats: VoiceActivityData['channelStats'],
  ): Promise<string> {
    const formatTime = (seconds: number) => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return hours > 0 ? `${hours}시간 ${minutes}분` : `${minutes}분`;
    };

    const summarized = {
      current: {
        totalUsers: currentData.totalStats.totalUsers,
        totalVoiceTime: formatTime(currentData.totalStats.totalVoiceTime),
        avgDailyActiveUsers: currentData.totalStats.avgDailyActiveUsers,
      },
      prev: {
        totalUsers: prevData.totalStats.totalUsers,
        totalVoiceTime: formatTime(prevData.totalStats.totalVoiceTime),
        avgDailyActiveUsers: prevData.totalStats.avgDailyActiveUsers,
      },
      topChannels: channelStats.slice(0, 3).map((c) => ({
        name: c.channelName,
        time: formatTime(c.totalVoiceTime),
        users: c.uniqueUsers,
      })),
    };

    const prompt = `
Discord 서버 주간 리포트 AI 종합 분석을 한국어로 작성해주세요.

이번 주:
- 활성 유저: ${summarized.current.totalUsers}명
- 총 음성 시간: ${summarized.current.totalVoiceTime}
- 일평균 활성 유저: ${summarized.current.avgDailyActiveUsers}명

지난 주:
- 활성 유저: ${summarized.prev.totalUsers}명
- 총 음성 시간: ${summarized.prev.totalVoiceTime}
- 일평균 활성 유저: ${summarized.prev.avgDailyActiveUsers}명

인기 채널 TOP 3: ${summarized.topChannels.map((c) => `${c.name}(${c.time}, ${c.users}명)`).join(', ')}

이번 주와 지난 주를 비교하여 변화와 특징을 2~4문장으로 분석해주세요. Discord Embed에 들어갈 텍스트입니다.
`;

    try {
      return await this.llmProvider.generateText(prompt, { maxOutputTokens: 512 });
    } catch (error) {
      this.logger.error('generateWeeklyReport failed', getErrorStack(error));
      return this.buildWeeklyReportFallback(currentData, prevData);
    }
  }

  private buildWeeklyReportFallback(
    currentData: VoiceActivityData,
    prevData: VoiceActivityData,
  ): string {
    const SECONDS_PER_HOUR = 3600;
    const currentHours = Math.floor(currentData.totalStats.totalVoiceTime / SECONDS_PER_HOUR);
    const prevHours = Math.floor(prevData.totalStats.totalVoiceTime / SECONDS_PER_HOUR);
    const diff = currentHours - prevHours;
    const trend = diff > 0 ? `${diff}시간 증가` : diff < 0 ? `${Math.abs(diff)}시간 감소` : '동일';
    return `이번 주 총 음성 시간은 ${currentHours}시간으로, 지난 주 대비 ${trend}했습니다. 총 ${currentData.totalStats.totalUsers}명이 활동했습니다.`;
  }

  async calculateCommunityHealth(activityData: VoiceActivityData): Promise<string> {
    const summarizedData = {
      guildId: activityData.guildId,
      timeRange: activityData.timeRange,
      totalStats: activityData.totalStats,
      topUsers: activityData.userActivities.slice(0, 5).map((u) => ({
        username: u.username,
        totalVoiceTime: u.totalVoiceTime,
        micUsageRate: u.micUsageRate,
        activeDays: u.activeDays,
      })),
      topChannels: activityData.channelStats.slice(0, 3).map((c) => ({
        channelName: c.channelName,
        totalVoiceTime: c.totalVoiceTime,
        uniqueUsers: c.uniqueUsers,
      })),
      recentTrends: activityData.dailyTrends.slice(RECENT_DAYS_SLICE),
    };

    const prompt = `
Discord 서버의 음성 채널 활동 데이터를 기반으로 커뮤니티 건강도를 분석해주세요.

데이터:
\`\`\`json
${JSON.stringify(summarizedData, null, 2)}
\`\`\`

다음 형식으로 분석 결과를 작성해주세요:

**🏥 건강도 점수: [0-100점]**

**📊 세부 평가:**
- 참여도: [평가]
- 성장세: [평가]
- 상호작용: [평가]
- 유지율: [평가]

**📝 종합 의견:**
[2-3문장으로 현재 상태 설명]

**💡 운영자를 위한 조언:**
[실질적인 조언]

간결하고 명확하게 작성해주세요.
`;

    try {
      return await this.llmProvider.generateText(prompt);
    } catch (error) {
      this.logger.error('Failed to calculate health score after retries:', getErrorMessage(error));
      return (
        '> AI 분석을 일시적으로 사용할 수 없어 기본 통계를 표시합니다.\n\n' +
        `- 총 활성 유저: ${activityData.totalStats.totalUsers}명\n` +
        `- 일평균 활성 유저: ${activityData.totalStats.avgDailyActiveUsers}명\n` +
        `- 총 음성 시간: ${Math.floor(activityData.totalStats.totalVoiceTime / 3600)}시간`
      );
    }
  }
}
