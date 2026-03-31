import type { Mocked } from 'vitest';

import { MetricsController } from './metrics.controller';
import { type PrometheusService } from './prometheus.service';

describe('MetricsController', () => {
  let controller: MetricsController;
  let prometheus: Mocked<PrometheusService>;

  beforeEach(() => {
    prometheus = {
      getMetrics: vi.fn(),
    } as unknown as Mocked<PrometheusService>;

    controller = new MetricsController(prometheus);
  });

  describe('getMetrics', () => {
    it('PrometheusService.getMetrics()를 호출한다', async () => {
      prometheus.getMetrics.mockResolvedValue('# HELP test\n');

      await controller.getMetrics();

      expect(prometheus.getMetrics).toHaveBeenCalledTimes(1);
    });

    it('PrometheusService.getMetrics()의 반환값을 그대로 반환한다', async () => {
      const metricsText =
        '# HELP http_requests_total Total number of HTTP requests\n' +
        '# TYPE http_requests_total counter\n' +
        'http_requests_total{method="GET",path="/health",status="200"} 1\n';
      prometheus.getMetrics.mockResolvedValue(metricsText);

      const result = await controller.getMetrics();

      expect(result).toBe(metricsText);
    });

    it('빈 문자열도 그대로 반환한다 (메트릭이 아직 없는 경우)', async () => {
      prometheus.getMetrics.mockResolvedValue('');

      const result = await controller.getMetrics();

      expect(result).toBe('');
    });
  });
});
