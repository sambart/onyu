#!/bin/bash
# ============================================================
# Let's Encrypt 초기 인증서 발급 스크립트
# 사용법: chmod +x init-letsencrypt.sh && ./init-letsencrypt.sh
# ============================================================

set -e

DOMAINS=(onyu.dev www.onyu.dev api.onyu.dev monitoring.onyu.dev)
EMAIL="dhyun.dev@gmail.com"  # Let's Encrypt 알림 이메일
STAGING=0  # 테스트 시 1로 변경 (rate limit 회피)

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.prod"
DC="docker compose --env-file $ENV_FILE -f $COMPOSE_FILE"

echo "### 인증서 발급 시작 ###"

# nginx가 실행 중인지 확인
if ! $DC ps nginx | grep -q "running"; then
    echo "nginx 컨테이너를 먼저 시작합니다..."
    $DC up -d nginx
    sleep 5
fi

# certbot으로 인증서 발급
DOMAIN_ARGS=""
for domain in "${DOMAINS[@]}"; do
    DOMAIN_ARGS="$DOMAIN_ARGS -d $domain"
done

STAGING_ARG=""
if [ $STAGING -eq 1 ]; then
    STAGING_ARG="--staging"
fi

$DC run --rm --entrypoint "" certbot certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    $STAGING_ARG \
    --email $EMAIL \
    --agree-tos \
    --no-eff-email \
    --force-renewal \
    $DOMAIN_ARGS

echo ""
echo "### 인증서 발급 완료! ###"
echo ""
echo "다음 단계:"
echo "1. SSL 설정 활성화:"
echo "   cp infra/nginx/conf.d/default.ssl.conf infra/nginx/conf.d/default.conf"
echo ""
echo "2. ssl-params.conf 주석 해제:"
echo "   vi infra/nginx/snippets/ssl-params.conf"
echo ""
echo "3. .env.prod URL을 HTTPS로 변경"
echo ""
echo "4. nginx 리로드:"
echo "   $DC exec nginx nginx -s reload"
