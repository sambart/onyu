output "static_ip" {
  description = "신규 Lightsail 정적 IP — DNS A 레코드 + GitHub Secret(LIGHTSAIL_HOST)"
  value       = aws_lightsail_static_ip.onyu.ip_address
}

output "name_servers" {
  description = "신규 hosted zone NS 4개 — 레지스트라에 등록"
  value       = aws_route53_zone.onyu.name_servers
}

output "zone_id" {
  description = "신규 hosted zone ID"
  value       = aws_route53_zone.onyu.zone_id
}

output "instance_name" {
  description = "Lightsail 인스턴스 이름"
  value       = aws_lightsail_instance.onyu.name
}

# 개인키 PEM — 추출: terraform output -raw ssh_private_key_pem > onyu-prod.pem
output "ssh_private_key_pem" {
  description = "SSH 개인키 (PEM) — 로컬 .pem + GitHub Secret(LIGHTSAIL_SSH_KEY)"
  value       = tls_private_key.ssh.private_key_pem
  sensitive   = true
}
