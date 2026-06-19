# Terraform state 백엔드 자체를 생성하는 부트스트랩 모듈.
# 닭-달걀 문제(원격 state 를 쓰려면 state 버킷이 먼저 있어야 함)를 해결하기 위해
# 이 모듈만 **로컬 state** 로 apply 하여 S3 버킷을 만든 뒤,
# 상위 메인 모듈이 이 버킷을 원격 백엔드로 사용한다.
#
# 락 방식: Terraform 1.11+ 의 S3 네이티브 락(use_lockfile) 사용 — DynamoDB 불필요.
#          (구 plan 의 "S3 + DynamoDB 락" 에서 변경 — DynamoDB 락 인자는 deprecated)

terraform {
  required_version = ">= 1.11"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
  }
}

provider "aws" {
  region  = var.region
  profile = var.profile

  default_tags {
    tags = {
      Project   = "onyu"
      ManagedBy = "terraform"
      Module    = "bootstrap"
    }
  }
}

data "aws_caller_identity" "current" {}

locals {
  # 계정 ID 를 접미사로 붙여 S3 전역 네임스페이스에서 유일성 보장.
  state_bucket_name = "onyu-tfstate-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket" "tfstate" {
  bucket = local.state_bucket_name

  # 실수로 state 버킷이 destroy 되는 것을 방지.
  lifecycle {
    prevent_destroy = true
  }
}

# state 파일 이력 보존 — 손상/실수 시 이전 버전으로 복구 가능.
resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  versioning_configuration {
    status = "Enabled"
  }
}

# 저장 시 암호화(SSE-S3). state 에는 민감정보가 포함될 수 있음.
resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

# 퍼블릭 접근 전면 차단.
resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
