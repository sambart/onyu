variable "region" {
  description = "AWS 리전 (서울)"
  type        = string
  default     = "ap-northeast-2"
}

variable "profile" {
  description = "AWS CLI named profile (신규 계정)"
  type        = string
  default     = "onyu-new"
}

variable "availability_zone" {
  description = "Lightsail 인스턴스 AZ"
  type        = string
  default     = "ap-northeast-2a"
}

variable "instance_name" {
  description = "Lightsail 인스턴스 이름"
  type        = string
  default     = "onyu-prod"
}

variable "blueprint_id" {
  description = "OS 블루프린트 (Ubuntu 24.04 LTS)"
  type        = string
  default     = "ubuntu_24_04"
}

variable "bundle_id" {
  description = "인스턴스 번들 (2GB/2vCPU/60GB, 듀얼스택, $12/월)"
  type        = string
  default     = "small_3_0"
}

variable "domain_name" {
  description = "서비스 도메인 (Route53 hosted zone)"
  type        = string
  default     = "onyu.dev"
}

variable "ssh_allowed_cidrs" {
  description = "SSH(22) 허용 CIDR. 운영 후 관리자 IP 로 좁히는 것을 권장."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}
