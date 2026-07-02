# 신규 hosted zone 생성 → NS 4개 발급(outputs.name_servers).
# 레지스트라(외부)에서 이 NS 로 교체하면 DNS 가 신규 계정으로 전환된다.
#
# ⚠️ DNS 레코드(A/CNAME/MX/TXT)는 구 AWS 계정 Route53 zone 을 export 한 뒤
#    `dns-records.tf` 로 별도 추가한다. A 레코드는 구 IP → 신규 정적 IP
#    (aws_lightsail_static_ip.onyu.ip_address)로 치환한다.
#    컷오버(Phase 5) 전까지 레지스트라 NS 는 구 zone 을 가리키므로,
#    이 zone 을 미리 만들어 두어도 트래픽 영향 없음.
resource "aws_route53_zone" "onyu" {
  name    = var.domain_name
  comment = "onyu production — migrated to new account 2026-06"
}
