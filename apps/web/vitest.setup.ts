/**
 * vitest 전역 설정.
 * pnpm 심볼릭 링크 환경에서 안정적으로 동작하도록 절대 경로를 사용한다.
 */

// @testing-library/jest-dom의 vitest 전용 엔트리를 사용한다
// import 경로는 pnpm 스토어의 실제 경로를 참조하여 symlink 문제를 우회한다
import 'E:/Workspace/discord/nest-dhyunbot/node_modules/.pnpm/@testing-library+jest-dom@6.9.1/node_modules/@testing-library/jest-dom/dist/index.js';
