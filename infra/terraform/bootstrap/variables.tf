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
