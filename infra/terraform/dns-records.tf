# DNS 레코드 — 신규 hosted zone 채우기.
#
# 2026-06-20 구 zone(구 AWS 계정 Route53) 공개 DNS 조회 결과:
#   - apex A onyu.dev      → 43.202.200.230 (구 서버)
#   - *.onyu.dev 와일드카드 → 43.202.200.230 (www/api 포함 전부 커버)
#   - MX 없음, TXT 없음 (이메일/SPF/DKIM/도메인인증 부재)
# → 복제 대상은 A 2개뿐. 둘 다 신규 정적 IP 로 치환한다.
#
# TTL 60s: 컷오버(레지스트라 NS 교체) 후 문제 발생 시 빠른 롤백/전파를 위해 낮게 유지.

locals {
  # 신규 Lightsail 정적 IP (lightsail.tf)
  server_ip = aws_lightsail_static_ip.onyu.ip_address
  dns_ttl   = 60
}

# apex: onyu.dev → 신규 서버
resource "aws_route53_record" "apex" {
  zone_id = aws_route53_zone.onyu.zone_id
  name    = var.domain_name
  type    = "A"
  ttl     = local.dns_ttl
  records = [local.server_ip]
}

# 와일드카드: *.onyu.dev → 신규 서버 (www, api 등 모든 서브도메인)
resource "aws_route53_record" "wildcard" {
  zone_id = aws_route53_zone.onyu.zone_id
  name    = "*.${var.domain_name}"
  type    = "A"
  ttl     = local.dns_ttl
  records = [local.server_ip]
}
