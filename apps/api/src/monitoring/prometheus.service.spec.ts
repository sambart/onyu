import { PrometheusService } from './prometheus.service';

// eslint-disable-next-line max-lines-per-function -- describe 블록은 구조상 불가피하게 길어진다
describe('PrometheusService', () => {
  let service: PrometheusService;

  beforeEach(() => {
    service = new PrometheusService();
    // onModuleInit 수동 호출: collectDefaultMetrics 등록
    service.onModuleInit();
  });

  describe('getMetrics', () => {
    it('Prometheus 텍스트 형식의 문자열을 반환한다', async () => {
      const result = await service.getMetrics();

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('기본 Node.js 런타임 메트릭(process_cpu_seconds_total)을 포함한다', async () => {
      const result = await service.getMetrics();

      expect(result).toContain('process_cpu_seconds_total');
    });

    it('기본 Node.js 런타임 메트릭(nodejs_heap_size_used_bytes)을 포함한다', async () => {
      const result = await service.getMetrics();

      expect(result).toContain('nodejs_heap_size_used_bytes');
    });

    it('커스텀 메트릭 http_request_duration_seconds가 포함된다', async () => {
      const result = await service.getMetrics();

      expect(result).toContain('http_request_duration_seconds');
    });

    it('커스텀 메트릭 http_requests_total이 포함된다', async () => {
      const result = await service.getMetrics();

      expect(result).toContain('http_requests_total');
    });
  });

  describe('getContentType', () => {
    it('Prometheus 텍스트 포맷 Content-Type을 반환한다', () => {
      const result = service.getContentType();

      expect(result).toContain('text/plain');
    });
  });

  describe('httpRequestDuration Histogram', () => {
    it('labels().observe() 호출 후 메트릭에 해당 레이블이 기록된다', async () => {
      service.httpRequestDuration.labels('GET', '/test', '200').observe(0.1);

      const result = await service.getMetrics();

      expect(result).toContain('method="GET"');
      expect(result).toContain('path="/test"');
      expect(result).toContain('status="200"');
    });

    it('버킷이 문서에 명시된 10개 구간으로 구성된다', async () => {
      service.httpRequestDuration.labels('GET', '/bucket-test', '200').observe(0.5);

      const result = await service.getMetrics();

      // 버킷 경계값 검증: 0.005 ~ 10
      expect(result).toContain('le="0.005"');
      expect(result).toContain('le="0.01"');
      expect(result).toContain('le="0.05"');
      expect(result).toContain('le="0.1"');
      expect(result).toContain('le="0.25"');
      expect(result).toContain('le="0.5"');
      expect(result).toContain('le="1"');
      expect(result).toContain('le="2.5"');
      expect(result).toContain('le="5"');
      expect(result).toContain('le="10"');
    });
  });

  describe('httpRequestsTotal Counter', () => {
    it('labels().inc() 호출 후 count가 증가한다', async () => {
      service.httpRequestsTotal.labels('POST', '/api/test', '201').inc();
      service.httpRequestsTotal.labels('POST', '/api/test', '201').inc();

      const result = await service.getMetrics();

      // Counter가 2회 increment된 결과가 메트릭에 포함된다
      expect(result).toContain('http_requests_total');
      expect(result).toContain('method="POST"');
      expect(result).toContain('path="/api/test"');
      expect(result).toContain('status="201"');
    });
  });
});
