# 원격 state — bootstrap 모듈이 생성한 S3 버킷 사용.
# 락: S3 네이티브 lockfile (use_lockfile) — DynamoDB 불필요 (TF 1.11+).
terraform {
  backend "s3" {
    bucket       = "onyu-tfstate-379271181006"
    key          = "lightsail/terraform.tfstate"
    region       = "ap-northeast-2"
    profile      = "onyu-new"
    encrypt      = true
    use_lockfile = true
  }
}
