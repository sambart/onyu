group "default" {
  targets = ["api", "bot", "web"]
}

variable "REGISTRY" {
  default = "ghcr.io/sambart/onyu"
}

variable "VERSION" {
  default = "latest"
}

variable "SHA" {
  default = ""
}

target "api" {
  dockerfile = "Dockerfile.prod"
  target     = "api"
  tags = compact([
    "${REGISTRY}/api:latest",
    SHA != "" ? "${REGISTRY}/api:${SHA}" : "",
    VERSION != "latest" ? "${REGISTRY}/api:${VERSION}" : "",
  ])
  cache-from = ["type=gha,scope=prod"]
  cache-to   = ["type=gha,mode=max,scope=prod"]
}

target "bot" {
  dockerfile = "Dockerfile.prod"
  target     = "bot"
  tags = compact([
    "${REGISTRY}/bot:latest",
    SHA != "" ? "${REGISTRY}/bot:${SHA}" : "",
    VERSION != "latest" ? "${REGISTRY}/bot:${VERSION}" : "",
  ])
  cache-from = ["type=gha,scope=prod"]
  cache-to   = ["type=gha,mode=max,scope=prod"]
}

target "web" {
  dockerfile = "Dockerfile.prod"
  target     = "web"
  tags = compact([
    "${REGISTRY}/web:latest",
    SHA != "" ? "${REGISTRY}/web:${SHA}" : "",
    VERSION != "latest" ? "${REGISTRY}/web:${VERSION}" : "",
  ])
  cache-from = ["type=gha,scope=prod"]
  cache-to   = ["type=gha,mode=max,scope=prod"]
}
