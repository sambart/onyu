output "state_bucket_name" {
  description = "메인 모듈 backend.tf 의 bucket 값으로 사용"
  value       = aws_s3_bucket.tfstate.id
}

output "region" {
  description = "메인 모듈 backend.tf 의 region 값으로 사용"
  value       = var.region
}
