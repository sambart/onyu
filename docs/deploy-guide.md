# 배포 가이드

## 아키텍처

```
GitHub (develop push) → CI 검증 (lint + build)
GitHub (main push)    → CI 검증 → GitHub Actions에서 Docker 이미지 빌드
                      → ghcr.io에 이미지 push
                      → Lightsail SSH 접속 → 이미지 pull → 컨테이너 재시작
```

---

## 1. Lightsail 인스턴스 초기 설정

### 1-1. 시스템 업데이트 + Docker 설치

```bash
sudo apt update && sudo apt upgrade -y

# Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker

# 확인
docker --version
docker compose version
```

### 1-2. 타임존 설정

```bash
sudo timedatectl set-timezone Asia/Seoul
```

### 1-3. 방화벽

```bash
sudo ufw allow OpenSSH
sudo ufw allow 3000   # API
sudo ufw allow 4000   # Web
sudo ufw enable
```

> Lightsail 콘솔 > Networking 탭에서도 3000, 4000 포트를 열어야 한다.

### 1-4. 프로젝트 클론 + 환경변수

```bash
git clone <repo-url> ~/onyu
cd ~/onyu
nano .env.prod   # 환경변수 입력
```

### 1-5. ghcr.io 로그인

서버에서 GitHub Container Registry의 이미지를 pull하려면 로그인이 필요하다.

```bash
echo "<GHCR_TOKEN>" | docker login ghcr.io -u <GITHUB_USERNAME> --password-stdin
```

> `GHCR_TOKEN`은 GitHub > Settings > Developer settings > Personal access tokens에서 `read:packages` 권한으로 생성한다.

### 1-6. 최초 실행

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml pull api web
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d
```

---

## 2. GitHub Secrets 설정

리포지토리 > Settings > Secrets and variables > Actions에 추가:

| Secret | 설명 | 예시 |
|---|---|---|
| `LIGHTSAIL_HOST` | Lightsail 퍼블릭 IP | `STATIC_IP` |
| `LIGHTSAIL_USER` | SSH 유저명 | `ubuntu` |
| `LIGHTSAIL_SSH_KEY` | SSH 프라이빗 키 전체 내용 | `-----BEGIN RSA PRIVATE KEY-----\n...` |
| `GHCR_TOKEN` | GitHub PAT (`read:packages` 권한) | `ghp_xxxx...` |

### SSH 키 확인 방법

Lightsail 콘솔에서 다운로드한 `.pem` 파일 내용 전체를 `LIGHTSAIL_SSH_KEY`에 붙여넣는다.

### GHCR_TOKEN 생성 방법

1. GitHub > Settings > Developer settings > Personal access tokens > Tokens (classic)
2. `read:packages` 권한 체크 후 생성
3. 생성된 토큰을 `GHCR_TOKEN` Secret에 등록

---

## 3. CI/CD 워크플로우

### CI (`ci.yml`)

| 트리거 | 동작 |
|---|---|
| `develop` push | lint + build 검증 |
| `main` push | lint + build 검증 |
| `main` PR | lint + build 검증 |

### Deploy (`deploy.yml`)

| 단계 | 동작 |
|---|---|
| 1. 빌드 (GitHub Actions) | Docker 이미지 빌드 → ghcr.io에 push (`api`, `web`) |
| 2. 배포 (Lightsail SSH) | `docker compose pull` → `up -d` → DB 마이그레이션 |

이미지 태그:
- `latest` — 항상 최신 배포 버전
- `<commit-sha>` — 특정 커밋 버전 (롤백용)

---

## 4. 배포 흐름

```
1. develop 브랜치에서 작업 + push → CI 자동 검증
2. develop → main PR 생성 → CI 자동 검증
3. main에 merge → CI 검증 + Docker 이미지 빌드/push + 자동 배포
```

---

## 5. 수동 배포 (긴급 시)

```bash
ssh ubuntu@<LIGHTSAIL_IP>
cd ~/onyu
git pull origin main
docker compose --env-file .env.prod -f docker-compose.prod.yml pull api web
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d
docker image prune -f
```

---

## 6. 롤백

특정 커밋의 이미지로 롤백할 수 있다.

```bash
ssh ubuntu@<LIGHTSAIL_IP>
cd ~/onyu

# 특정 커밋의 이미지로 롤백
docker compose --env-file .env.prod -f docker-compose.prod.yml pull \
  ghcr.io/sambart/onyu/api:<commit-sha> \
  ghcr.io/sambart/onyu/web:<commit-sha>

# docker-compose.prod.yml에서 image 태그를 해당 commit-sha로 변경 후
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d
```

---

## 7. 운영 명령어

```bash
# 로그 확인
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f web

# 특정 서비스 재시작
docker compose -f docker-compose.prod.yml restart api

# 전체 중지
docker compose -f docker-compose.prod.yml down

# 최신 이미지 pull + 재시작
docker compose --env-file .env.prod -f docker-compose.prod.yml pull api web
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d

# 미사용 이미지 정리
docker image prune -f

# DB 접속 (디버깅)
docker exec -it postgres-prod psql -U $DATABASE_USER -d $DATABASE_NAME
```

---

## 8. 트러블슈팅

### 이미지 pull 실패 시

```bash
# ghcr.io 로그인 확인
docker login ghcr.io

# 토큰 재설정
echo "<GHCR_TOKEN>" | docker login ghcr.io -u <GITHUB_USERNAME> --password-stdin
```

### 디스크 부족 시

```bash
docker system prune -a   # 미사용 이미지/컨테이너 전체 정리
```

### DB 마이그레이션 필요 시

TypeORM `synchronize: true` (개발)이 아닌 프로덕션에서는 마이그레이션 실행:

```bash
docker exec -it nest-api-prod node -e "require('./dist/apps/api/src/data-source').default.runMigrations()"
```
