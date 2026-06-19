# Lightsail 신규 AWS 계정 마이그레이션 + Terraform 도입 계획

> 작성일: 2026-06-17
> 트랙: ops (devops / 인프라 / 마이그레이션)
> 본 문서는 **실행 계획**이며, 본 계획 승인 후 Terraform 코드 작성 → 부트스트랩 → 컷오버 순으로 진행한다.
> 본 계획은 **계획서**다 — 코드/리소스 생성은 포함하지 않는다.

---

## 개요

현재 onyu 운영 환경(구 AWS 계정의 Lightsail 2GB 단일 VM)을 **신규 AWS 계정**으로 이전한다. 이전과 동시에 (1) **모니터링 인프라 스택 제거**(A안)로 컨테이너를 경량화하고, (2) 신규 계정은 기존 리소스가 없는 greenfield 이므로 **Terraform 으로 인프라를 코드화**(import 불필요)하며, (3) **postgres 운영 데이터를 전량 보존**(`pg_dump` → `pg_restore`)한다.

### 확정된 의사결정

| 항목 | 결정 |
|------|------|
| 호스팅 형태 | **Lightsail 유지** (EC2/RDS 분리 안 함 — 비용 약 4~5배라 기각) |
| 인스턴스 | 2GB / 2vCPU 번들 ($12/월) 유지 |
| 모니터링 스택 | **제거** (prometheus/grafana/loki/promtail/alertmanager/exporter 8개) — 컨테이너 15→7 |
| 신규 계정 프로비저닝 | **Terraform** (greenfield, import 불필요) |
| Terraform state | **S3 + 네이티브 락**(`use_lockfile`) — DynamoDB 불필요(TF 1.11+ GA, 2026-06-20 변경). state 버킷 `onyu-tfstate-379271181006` 생성 완료 |
| DNS | Route53 **호스팅존도 신규 계정으로 이전** |
| 데이터 | postgres **전량 보존** (`pg_dump -Fc` → `pg_restore`) |
| 리전 | ap-northeast-2 (서울) |

### 비용 (참고)

이전 후에도 **$12/월 (Lightsail 2GB) + Route53 ~$1/월 ≈ $13/월** 로 동일. 모니터링 제거로 2GB RAM 여유 확보(상주 수요 ~2.3GB → ~1.1~1.4GB).

---

## 전제 조건 / 진행 전 확인 필요 (HITL) — ✅ 확정 (2026-06-20)

> 아래 3가지는 계획 실행 착수 전 반드시 확정해야 한다 — DNS·실행 방식·데이터 범위가 갈린다. **2026-06-20 전부 확정됨.**

| # | 확인 항목 | 분기 | 확정 |
|---|----------|------|------|
| 1 | **도메인(onyu.dev) 등록처** | (a) **외부 레지스트라**(가비아/Namecheap 등) → NS 레코드만 교체 (간단) / (b) **Route53 Domains(구 계정)** → zone 이전과 **별개로 도메인 등록 자체의 계정 간 이전**(`transfer-domain-to-another-aws-account`) 필요 — 수일 소요 | ✅ **(a) 외부 레지스트라** — NS 레코드 교체 |
| 2 | **실행 주체 / AWS 자격증명** | Terraform `apply`·zone 복제·DB 덤프를 (a) 담당자가 직접 실행 / (b) 본 환경의 CLI로 실행 — 자격증명 존재 여부 확인 | ✅ **(b) 본 환경 CLI** — AWS CLI v2.35.8 + Terraform v1.15.6 설치 완료. 신규 계정은 생성됨, **IAM 액세스 키 발급 대기** |
| 3 | **redis 데이터 보존 여부** | (a) 캐시 전용 → 무시 / (b) 영속 데이터 존재 → `dump.rdb` 복사 대상 추가 | ✅ **(b) 보존** — 코드 확인 결과 운영 상태(진행중 voice 세션/status-prefix/sticky messageId/auto-channel 매핑)가 PG 미동기 → 컷오버 시 `dump.rdb` 복사 포함 |
| 4 | **모니터링 제거(A안) 시점** | (a) 본 마이그레이션과 함께 / (b) 선행 별도 PR | ✅ **(a) 마이그레이션과 함께** — 신규 환경 구축 시 제거 반영 + 레포 정의파일 동시 정리 |

> ⚠️ **파괴적 작업 게이트**: 구 계정 인스턴스/호스팅존 삭제(Phase 7)는 신규 환경 검증 + DNS 전파 확인 완료 후에만 수행한다. 신규 계정 결제수단·서비스 한도(Lightsail 신규 계정 기본 quota) 사전 확인 필요.

---

## 모니터링 스택 제거 범위 (A안 — 본 마이그레이션에 선반영) — ✅ 완료 (2026-06-20)

신규 계정 구축 시 모니터링을 빼고 올리되, 레포의 정의 파일도 함께 정리한다. **2026-06-20 `feature/lightsail-migration` 브랜치에서 완료** — service 8종 + 전용 볼륨 3종 제거(compose 양쪽), nginx `monitoring.onyu.dev` 블록 + grafana depends_on 제거, deploy.yml 모니터링 스텝 제거, env.example 정리, `infra/{prometheus,grafana,loki,promtail,alertmanager}/` 삭제, certbot DOMAINS 에서 `monitoring.onyu.dev` 제거. 잔여 참조 grep 0건. 앱 내부 metrics 코드(`apps/*/src/monitoring/`)는 A-1 범위로 보존.

| 파일 | 변경 |
|------|------|
| `docker-compose.prod.yml` | 모니터링 service 8개 + 볼륨 3개(`prometheus_data_prod`/`grafana_data_prod`/`loki_data_prod`) + nginx `depends_on: grafana` 제거 |
| `docker-compose.yml` | 동일 8개 service + 볼륨 제거 (L93~216) |
| `infra/nginx/conf.d/default.conf` | `monitoring.onyu.dev` server 블록 + grafana upstream 제거, L9 `server_name`에서 `monitoring.onyu.dev` 삭제 |
| `.github/workflows/deploy.yml` | 모니터링 볼륨 생성·재시작 블록(L186~192) 제거 |
| `.env.prod.example` / `.env.example` | `GF_SECURITY_ADMIN_*`, `DISCORD_ALERT_WEBHOOK_URL` 제거 |
| `infra/{prometheus,grafana,loki,promtail,alertmanager}/` | 디렉토리 삭제 |

> **앱 내부 metrics 코드**(`apps/api/src/monitoring/`, `apps/bot/src/monitoring/` — `/metrics` 노출)는 **이번 범위에서 건드리지 않는다(A-1)**. prometheus 컨테이너 제거로 스크랩되지 않는 고아 엔드포인트가 되지만 무비용이며, 추후 Grafana Cloud 등 도입 시 재사용 가능. 완전 제거(A-2)는 별도 BE 작업으로 분리.

---

## Terraform 구성 (greenfield)

신규 계정에 기존 리소스가 없으므로 `terraform import` 없이 신규 생성한다.

### 디렉토리 구조 (신설)

```
infra/terraform/
├── bootstrap/            # state 백엔드 자체 생성 (선닭-달걀 해결, 로컬 state) ✅ apply 완료
│   ├── main.tf           #   S3 버킷(버저닝/암호화/퍼블릭차단). DynamoDB 없음(S3 네이티브 락)
│   ├── variables.tf      #   region(ap-northeast-2) / profile(onyu-new)
│   └── outputs.tf        #   state_bucket_name = onyu-tfstate-379271181006
├── backend.tf            # S3 백엔드 선언 (use_lockfile=true, bootstrap 산출물 참조)
├── providers.tf          # aws provider, region=ap-northeast-2, profile=신규계정
├── variables.tf          # 도메인, 번들 사이즈, 허용 IP 등
├── lightsail.tf          # 인스턴스(2GB) + 정적 IP(+attach) + key pair + instance firewall(22/80/443)
├── route53.tf            # hosted zone(onyu.dev) + A/CNAME/MX/TXT 레코드
├── outputs.tf            # 정적 IP, 신규 NS 4개 (→ 레지스트라 등록용)
└── terraform.tfvars      # 실제 값 (gitignore)
```

### 관리 리소스

| 리소스 | Terraform 타입 | 비고 |
|--------|----------------|------|
| Lightsail 인스턴스 | `aws_lightsail_instance` | blueprint=ubuntu, bundle=`small_3_0`(2GB/2vCPU/60GB, 듀얼스택 IPv4+IPv6, $12/월). ⚠️ 구세대 `small_2_0` 은 신규 계정 미제공 — 2026-06-20 CLI 확인 |
| 정적 IP | `aws_lightsail_static_ip` + `aws_lightsail_static_ip_attachment` | |
| 방화벽 | `aws_lightsail_instance_public_ports` | 22/80/443 |
| Key pair | `aws_lightsail_key_pair` | SSH 키 (또는 기존 키 import) |
| Hosted zone | `aws_route53_zone` | 신규 생성 → 새 NS 4개 발급 |
| DNS 레코드 | `aws_route53_record` | A(→정적IP), CNAME(www/api), 기타 |
| state 백엔드 | `aws_s3_bucket` + `aws_dynamodb_table` | bootstrap 모듈에서 |

### `.gitignore` 추가 필요 (terraform 항목 전무)

```
infra/terraform/**/.terraform/
infra/terraform/**/*.tfstate*
infra/terraform/**/*.tfvars
infra/terraform/**/crash.log
```

---

## 단계별 실행 계획

### Phase 0 — 준비 (구 계정 / 로컬)

- [ ] 신규 계정 결제수단·Lightsail quota·IAM 사용자(또는 SSO) + 액세스 키 확보
- [ ] 도메인 등록처 확인 (전제조건 #1)
- [ ] **DNS TTL 사전 인하** — 구 zone의 A/NS 레코드 TTL을 60s로 낮춤 (컷오버 1~2일 전, 전파 시간 단축)
- [ ] 구 zone 레코드 전량 export: `aws route53 list-resource-record-sets --hosted-zone-id <OLD_ZONE>` → JSON 보관

### Phase 1 — Terraform 부트스트랩 (신규 계정)

- [x] `infra/terraform/bootstrap/` 작성 → 로컬 state로 `apply` → state용 S3 버킷 생성 (✅ 2026-06-20, `onyu-tfstate-379271181006`. DynamoDB 없이 S3 네이티브 락)
- [ ] `backend.tf` 에 백엔드 연결 → `terraform init -migrate-state` (메인 모듈 작성 시)

### Phase 2 — Terraform 인프라 생성 (신규 계정)

- [x] `providers/backend/variables/lightsail/route53/outputs.tf` 작성 → `plan` → `apply` (✅ 2026-06-20, 7 리소스)
- [x] **산출물 확보** (✅ 2026-06-20):
  - 정적 IP: **`13.209.92.147`**
  - hosted zone ID: `Z0995631NPAEQRNRMXB8`
  - NS 4개: `ns-1396.awsdns-46.org` / `ns-1814.awsdns-34.co.uk` / `ns-424.awsdns-53.com` / `ns-547.awsdns-04.net`
  - SSH 키: `~/.ssh/onyu-prod.pem` (추출 완료, SSH 접속 확인 — Ubuntu 24.04.4 LTS, 2vCPU/1.9GB)
- [x] **DNS 레코드 복제** (✅ 2026-06-20) — 공개 DNS 조회로 구 zone 구성 확인 결과 **A 2개뿐**(apex + `*.onyu.dev` 와일드카드, 둘 다 구 IP `43.202.200.230`. MX·TXT 없음 → 이메일/인증 레코드 부재). 구 계정 자격증명 불필요. `dns-records.tf` 로 신규 IP `13.209.92.147` 가리키는 apex+와일드카드 A(TTL 60s) 생성 + 신규 NS 직접질의로 검증 완료. (레지스트라 NS 교체는 Phase 5 컷오버까지 미실시)

> **구 환경 참조값** (롤백/대조용): 구 서버 IP `43.202.200.230`, 구 NS `ns-702.awsdns-23.net`/`ns-1290.awsdns-33.org`/`ns-1934.awsdns-49.co.uk`/`ns-495.awsdns-61.com`

### Phase 3 — 서버 셋업 (신규 인스턴스)

- [x] SSH 접속 → Docker / docker compose 설치 (✅ 2026-06-20, Docker 29.6.0 + Compose v5.1.4)
- [x] 레포 클론 (✅ 2026-06-20, `~/onyu` develop 체크아웃 = 모니터링 제거 반영 `f775a06`. read-only 배포키 등록 — repo key id 154953559)
- [x] `.env.prod` 안전 복사 (✅ 2026-06-20, scp → `~/onyu/.env.prod`, 권한 600. 기존 운영 시크릿 재사용)
  - ⚠️ **드리프트 보강**: 구 운영서버에 직접 추가됐던 `SUPER_ADMIN_IDS`(super-admin)가 로컬 사본에 없어 누락 → 구→신규 스트리밍으로 보강. 키 해시 비교 결과 **28키 전부 일치** 확인. (로컬 `.env.prod`도 이 키 누락 — 별도 갱신 권장)
- [x] GHCR 로그인 → 이미지 pull (✅ 2026-06-20, api 933MB/bot 531MB/web 1.34GB). ⚠️ 사용한 GHCR PAT 는 노출됐으므로 컷오버 후 폐기 권장

> ⚠️ **배포 시퀀싱**: deploy.yml CI 는 `main` push 시 `git pull origin main` 으로 배포한다. 모니터링 제거는 현재 **develop 에만** 있으므로, 컷오버(Phase 5) 전 **develop→main 머지**가 선행돼야 CI 가 올바른 config 로 배포한다. Phase 3 테스트 셋업은 develop 클론으로 진행.

### Phase 4 — 데이터 마이그레이션 (테스트 복원) — ✅ 데이터계층 완료 (2026-06-20)

> DB user=`dhyun`, db=`dhyunbot`. external 볼륨 2개(`nestjs-dhyunbot_postgres_data_prod`/`_redis_data_prod`)는 신규 서버에 수동 생성 필요(prod compose 가 `external: true`).

- [x] 구 서버 덤프: `pg_dump -Fc`(4.1MB, 160객체) + redis `/data` tar(17MB — AOF 64MB가 권위본, dump.rdb 아님) → 구→로컬→신규 relay
- [x] 신규 서버 복원: external 볼륨 생성 → redis 볼륨 AOF 선적재 → `db`+`redis`만 기동 → `pg_restore --clean --if-exists --no-owner`
- [x] **검증**: postgres 37테이블·행수 일치(co_presence 라이브 누적분만 차이), redis 1165 keys 로드 OK
- [ ] **앱 스택 기동 + 헬스체크는 Phase 5(컷오버)로 이연** — ⚠️ 신규 서버에서 `bot` 기동 시 동일 Discord 토큰으로 구 봇과 게이트웨이 충돌, `api` 스케줄러가 라이브 길드 변경(추방 등) 위험. **구 스택 중단 후에만 앱 기동.**

> ⚠️ 위 복원은 **테스트/베이스라인**이다. 컷오버 시 구 서버 쓰기 중단 후 **최종 증분 재덤프**로 갱신한다(Phase 5).

### Phase 5 — 컷오버 (다운타임 최소화)

> 여기서부터 사용자 영향. 트래픽 한산한 시간대 권장.

**✅ 사전작업 완료 (2026-06-20, 다운타임 0):**
- TLS 인증서 구→신규 복사 완료(`onyu_certbot_conf`/`onyu_certbot_www`, onyu.dev/www/api, 만료 9/1) → **certbot 재발급 불필요**, 컷오버 즉시 HTTPS
- 앱 이미지 pull 완료, db/redis 테스트 복원 + 가동 중
- 신규 zone DNS 레코드 준비완료(apex+와일드카드 A → 13.209.92.147, TTL 60s)

**봇 정지 예상: ≈3~5분** (DNS 전파와 무관 — 봇은 Discord 게이트웨이 아웃바운드). web/api 체감은 NS 전파 tail에 좌우(구 서버 살려두면 전파 중 구 IP 서빙).

**컷오버 런북 (순서):**
1. ✅ (사전, 2026-06-20 완료) develop→main 머지 [PR #103] → CI 배포 성공(구 서버, **v1.27.0**, 헬스체크 통과). main 에 모니터링 제거 + 전체 develop 반영. GHCR `:latest`=v1.27.0.
   - ✅ (2026-06-20 완료) 신규 서버 `~/onyu` main 전환(HEAD `ca9de2c` v1.27.0) + v1.27.0 이미지 재pull. 모니터링 참조 0 확인. db/redis healthy 유지.
2. 점검 공지 → 구 서버 `api`+`bot` 중단(쓰기 정지, `db`/`redis` 는 유지)
3. **최종 덤프 스트리밍**(파일 미경유): 구 `pg_dump -Fc` → 신규 `pg_restore --clean --if-exists --no-owner` 직결, redis `/data` 재적재(볼륨 교체)
4. 신규 전체 스택 기동: `docker compose --env-file .env.prod -f docker-compose.prod.yml up -d` (db/redis 가동중 → api/bot/web/nginx 추가)
5. api/web 헬스체크(컨테이너 내부 3000/4000) → 봇 Discord 접속 확인
6. **가비아 NS 4개 교체** → 전파 대기 → `https://onyu.dev` HTTPS·로그인 검증
7. nginx reload (`docker compose exec nginx nginx -s reload`)

> ⚠️ **롤백**: NS 미변경 상태면 구 봇 재기동만으로 복귀. NS 변경 후 문제 시 가비아 NS 를 구 zone(`ns-702.awsdns-23.net` 등)으로 원복(TTL 60s).

> 🔧 **컷오버 tail 브리지 (2026-06-20)**: DNS 전파 tail 동안 구 IP 로 오는 사용자가 구 서버 api 정지로 502 를 받던 것을 해소하기 위해, **구 nginx 를 신규 서버로 프록시 브리지** 설정(`~/onyu/infra/nginx/conf.d/default.conf`, 백업 `.cutover-bak`). 구 IP·신규 IP 양쪽 다 신규 서버 서빙. **Phase 7 구 서버 폐기 시 함께 제거**. (이 브리지로 인해 구 서버 단독 롤백은 불가 — 롤백 시 브리지 원복 + 구 api/bot 재기동 필요. 단 신규 안정 확인됨)

> ✅ **컷오버 실행 완료 (2026-06-20)**: 구 api/bot 정지 → 최종 덤프(pg 4.1MB + redis 17MB) → 신규 복원 → 전체 스택 기동 → api/web/봇 검증 통과(봇 Discord 연결·동기화) → 가비아 NS 교체(전파 확인 8.8.8.8/9.9.9.9/KT 신규 IP) → HTTPS·api 200 검증. **봇 실측 정지 ~4분.** 구 서버는 롤백 대비 유지(api/bot 정지, db/redis/web/nginx 가동).

### Phase 6 — 검증

- [x] DNS: 8.8.8.8/9.9.9.9/168.126.63.1 → 신규 IP `13.209.92.147`, 위임 신규 NS 4개 확인 (구 A TTL 60s, 잔여 전파 tail 단시간)
- [ ] 웹 로그인(Discord OAuth) E2E **— 사용자 브라우저 확인 권장** (봇 슬래시 커맨드 실동작 포함)
- [x] HTTPS 인증서 유효(onyu.dev/www/api, 만료 9/1) + api `/health` 200, web 200, www 301
- [x] **GitHub Secrets 갱신**: `LIGHTSAIL_HOST`=13.209.92.147 / `LIGHTSAIL_USER`=ubuntu / `LIGHTSAIL_SSH_KEY`=신규키 (2026-06-20 16:38). 신규 서버 `~/onyu` main + `~/.ssh/config` 배포키 매핑으로 CI `git pull` 검증 완료

### Phase 7 — 정리 (파괴적 — 게이트)

> DNS 전파 + 신규 환경 안정 확인(최소 24~48h) 후에만 수행.

- [ ] 구 계정 Lightsail 인스턴스·정적 IP 폐기
- [ ] 구 계정 Route53 호스팅존 삭제
- [ ] 구 계정 잔여 리소스(스냅샷 등) 정리

---

## 롤백 전략

| 시점 | 롤백 방법 |
|------|-----------|
| Phase 5 NS 교체 직후 문제 | **레지스트라 NS를 구 zone NS로 원복** (구 zone·구 인스턴스를 Phase 7까지 살려두므로 즉시 복귀 가능). TTL 60s라 전파 빠름 |
| 데이터 정합 문제 | 구 서버가 아직 살아있으므로 트래픽을 구 IP로 되돌리고 재덤프 |
| 핵심 원칙 | **Phase 7(구 리소스 삭제) 전까지 구 환경을 항상 가동 상태로 유지** → 언제든 NS만 되돌리면 복귀 |

---

## 변경 범위 요약

| 구분 | 내용 |
|------|------|
| 신규 파일 | `infra/terraform/**` (bootstrap + 메인 모듈), `.gitignore` terraform 항목 |
| 수정 파일 | `docker-compose.yml`, `docker-compose.prod.yml`, `.github/workflows/deploy.yml`, `infra/nginx/conf.d/default.conf`, `.env.prod.example`, `.env.example` |
| 삭제 디렉토리 | `infra/{prometheus,grafana,loki,promtail,alertmanager}/` |
| 외부 작업 | 신규 AWS 계정 셋업, 레지스트라 NS 교체, GitHub Secrets 갱신, `.env.prod` 이관 |
| 데이터 | postgres `pg_dump`→`pg_restore` (+ 조건부 redis) |

---

## 미결 사항 (실행 착수 전 확정) — ✅ 전부 확정 (2026-06-20)

1. ✅ 도메인 등록처 → **외부 레지스트라** (NS 레코드만 교체)
2. ✅ 실행 주체·자격증명 → **본 환경 CLI** (AWS CLI v2.35.8 + Terraform v1.15.6 설치 완료, 신규 계정 IAM 액세스 키 발급 대기)
3. ✅ redis 보존 → **보존** (컷오버 시 `dump.rdb` 복사)
4. ✅ 모니터링 제거(A안) → **본 마이그레이션과 함께**

> 다음 액션: 신규 계정 IAM 관리자 사용자 + 액세스 키 발급 → `aws configure --profile onyu-new` → Phase 1(Terraform bootstrap) 착수.
