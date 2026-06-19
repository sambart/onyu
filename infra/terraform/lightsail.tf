# ─── SSH Key ────────────────────────────────────────────────
# Terraform 으로 신규 키 생성 → 공개키만 Lightsail 에 등록.
# 개인키(PEM)는 tfstate(암호화 S3)에 저장되며, output(sensitive)으로 추출해
# 로컬 .pem 파일 + GitHub Secret(LIGHTSAIL_SSH_KEY) 에 보관한다.
resource "tls_private_key" "ssh" {
  algorithm = "RSA"
  rsa_bits  = 4096
}

resource "aws_lightsail_key_pair" "onyu" {
  name       = "${var.instance_name}-key"
  public_key = tls_private_key.ssh.public_key_openssh
}

# ─── Instance ───────────────────────────────────────────────
resource "aws_lightsail_instance" "onyu" {
  name              = var.instance_name
  availability_zone = var.availability_zone
  blueprint_id      = var.blueprint_id
  bundle_id         = var.bundle_id
  key_pair_name     = aws_lightsail_key_pair.onyu.name
}

# ─── Static IP ──────────────────────────────────────────────
resource "aws_lightsail_static_ip" "onyu" {
  name = "${var.instance_name}-ip"
}

resource "aws_lightsail_static_ip_attachment" "onyu" {
  static_ip_name = aws_lightsail_static_ip.onyu.name
  instance_name  = aws_lightsail_instance.onyu.name
}

# ─── Firewall (22/80/443) ───────────────────────────────────
resource "aws_lightsail_instance_public_ports" "onyu" {
  instance_name = aws_lightsail_instance.onyu.name

  port_info {
    protocol  = "tcp"
    from_port = 22
    to_port   = 22
    cidrs     = var.ssh_allowed_cidrs
  }

  port_info {
    protocol   = "tcp"
    from_port  = 80
    to_port    = 80
    cidrs      = ["0.0.0.0/0"]
    ipv6_cidrs = ["::/0"]
  }

  port_info {
    protocol   = "tcp"
    from_port  = 443
    to_port    = 443
    cidrs      = ["0.0.0.0/0"]
    ipv6_cidrs = ["::/0"]
  }
}
