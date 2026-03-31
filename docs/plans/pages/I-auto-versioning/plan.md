# 자동 시맨틱 버저닝 전략

## 개요

CI/CD 파이프라인에서 Conventional Commits를 분석하여 **자동으로 시맨틱 버전을 결정**하고, package.json 업데이트 + Git 태그 생성 + Docker 이미지 태깅까지 수행하는 전략.

## 현재 상태

- 버전: root, api, web 3곳 package.json에서 수동 동기화 (`1.1.0`)
- 커밋 컨벤션: `feat:`, `fix:`, `docs:` 등 Conventional Commits 사용 중
- 배포: `main` push → Docker 빌드 → ghcr.io push → Lightsail 배포
- 태그: 미사용 (자동 태깅 없음)

## 버전 결정 규칙

| 커밋 prefix | 버전 변경 | 예시 |
|---|---|---|
| `feat!:` 또는 `BREAKING CHANGE` footer | **MAJOR** (1.1.0 → 2.0.0) | 호환성 깨지는 변경 |
| `feat:` | **MINOR** (1.1.0 → 1.2.0) | 새 기능 추가 |
| `fix:` | **PATCH** (1.1.0 → 1.1.1) | 버그 수정 |
| `docs:`, `chore:`, `style:`, `refactor:`, `test:`, `ci:` | **변경 없음** | 문서, 설정 변경 등 |

- 여러 커밋이 있을 경우 **가장 높은 레벨**을 적용 (MAJOR > MINOR > PATCH)
- 버전 변경이 없는 커밋만 있으면 **버전 범프 스킵** (태그 미생성, 기존 버전 유지)

## 파이프라인 흐름

```
main에 PR 머지
  ↓
[version-bump job]
  1. 마지막 Git 태그(v*) 조회
  2. 태그 이후 커밋 메시지 분석
  3. 버전 레벨 결정 (major/minor/patch/none)
  4. none이면 → 버전 범프 스킵, 기존 버전으로 빌드 진행
  5. package.json 3곳 업데이트
  6. "[release] vX.Y.Z" 커밋 생성
  7. Git 태그 vX.Y.Z 생성 및 push
  8. 새 버전을 output으로 전달
  ↓
[build-and-push job]
  - Docker 이미지 빌드
  - 태그: latest, git-sha, vX.Y.Z (버전 태그)
  ↓
[deploy job]
  - 기존과 동일
```

## 구현 파일

### 1. `scripts/bump-version.sh`

커밋 분석 및 버전 계산 스크립트.

```bash
#!/bin/bash
set -e

# 마지막 태그 조회 (없으면 최초 커밋부터)
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
if [ -z "$LAST_TAG" ]; then
  COMMITS=$(git log --oneline --format="%s")
else
  COMMITS=$(git log "${LAST_TAG}..HEAD" --oneline --format="%s")
fi

# 버전 레벨 결정
BUMP="none"
while IFS= read -r msg; do
  # Merge 커밋 스킵
  [[ "$msg" =~ ^Merge ]] && continue

  # BREAKING CHANGE 체크
  if [[ "$msg" =~ ^[a-z]+!: ]] || [[ "$msg" =~ BREAKING\ CHANGE ]]; then
    BUMP="major"
    break  # major보다 높은 건 없으므로 즉시 종료
  fi

  # feat → minor
  if [[ "$msg" =~ ^feat ]]; then
    [ "$BUMP" != "major" ] && BUMP="minor"
  fi

  # fix → patch
  if [[ "$msg" =~ ^fix ]]; then
    [ "$BUMP" == "none" ] && BUMP="patch"
  fi
done <<< "$COMMITS"

# 현재 버전 읽기
CURRENT_VERSION=$(node -p "require('./package.json').version")

# 새 버전 계산
if [ "$BUMP" == "none" ]; then
  echo "no-bump"
  exit 0
fi

IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"
case "$BUMP" in
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  patch) PATCH=$((PATCH + 1)) ;;
esac

NEW_VERSION="${MAJOR}.${MINOR}.${PATCH}"
echo "$NEW_VERSION"
```

### 2. `scripts/apply-version.sh`

계산된 버전을 package.json 3곳에 적용.

```bash
#!/bin/bash
set -e

NEW_VERSION=$1
if [ -z "$NEW_VERSION" ] || [ "$NEW_VERSION" == "no-bump" ]; then
  echo "No version bump needed"
  exit 0
fi

# package.json 3곳 업데이트
npm version "$NEW_VERSION" --no-git-tag-version
npm version "$NEW_VERSION" --no-git-tag-version --workspace=@onyu/api
npm version "$NEW_VERSION" --no-git-tag-version --workspace=@onyu/web

echo "Updated all package.json to v${NEW_VERSION}"
```

### 3. `.github/workflows/deploy.yml` 수정사항

```yaml
jobs:
  version-bump:
    runs-on: ubuntu-latest
    permissions:
      contents: write    # 태그 push 권한
    outputs:
      new_version: ${{ steps.bump.outputs.version }}
      skipped: ${{ steps.bump.outputs.skipped }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0    # 전체 히스토리 (태그 조회에 필요)
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Calculate version
        id: bump
        run: |
          VERSION=$(bash scripts/bump-version.sh)
          if [ "$VERSION" == "no-bump" ]; then
            echo "skipped=true" >> $GITHUB_OUTPUT
            echo "version=$(node -p "require('./package.json').version")" >> $GITHUB_OUTPUT
          else
            echo "skipped=false" >> $GITHUB_OUTPUT
            echo "version=$VERSION" >> $GITHUB_OUTPUT

            # 버전 적용
            bash scripts/apply-version.sh "$VERSION"

            # 커밋 & 태그
            git config user.name "github-actions[bot]"
            git config user.email "github-actions[bot]@users.noreply.github.com"
            git add package.json apps/api/package.json apps/web/package.json
            git commit -m "[release] v${VERSION}"
            git tag "v${VERSION}"
            git push origin main --tags
          fi

  build-and-push:
    needs: version-bump
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - name: Checkout (latest with version bump)
        uses: actions/checkout@v4
        with:
          ref: main    # version-bump 커밋 포함

      # ... 기존 빌드 스텝 ...
      # Docker 이미지 태그에 버전 추가:
      # tags: |
      #   ${{ env.API_IMAGE }}:latest
      #   ${{ env.API_IMAGE }}:${{ github.sha }}
      #   ${{ env.API_IMAGE }}:v${{ needs.version-bump.outputs.new_version }}
```

## 무한 루프 방지

`[release] v*` 커밋이 다시 deploy workflow를 트리거하지 않도록:

```yaml
on:
  push:
    branches: [main]
    paths-ignore:
      - '**/package.json'  # 방법 1: package.json 변경 무시
```

또는 커밋 메시지에 `[skip ci]`를 포함:

```bash
git commit -m "[release] v${VERSION} [skip ci]"
```

**권장: `[skip ci]` 방식** — `paths-ignore`는 다른 변경과 함께 package.json이 바뀌는 경우를 놓칠 수 있음.

## 초기 설정 (1회)

현재 버전 `1.1.0`에 대한 최초 태그 생성이 필요:

```bash
git tag v1.1.0
git push origin v1.1.0
```

이 태그가 있어야 이후 커밋 분석의 시작점이 됨.

## Docker 이미지 태깅 변화

| 기존 | 변경 후 |
|---|---|
| `latest`, `<git-sha>` | `latest`, `<git-sha>`, `v1.2.0` |

버전 태그가 추가되어 특정 버전으로 롤백 시 용이.

## 주의사항

1. **fetch-depth: 0 필수** — 태그와 커밋 히스토리 전체가 필요
2. **`contents: write` 권한** — version-bump job에서 태그를 push하기 위해 필요
3. **Merge 커밋 제외** — `Merge pull request #N` 커밋은 버전 분석에서 스킵
4. **모노레포 동기화** — 항상 3곳 package.json을 동시에 업데이트
5. **수동 오버라이드** — 개발자가 직접 package.json 버전을 올린 경우, 스크립트가 그 위에 덮어쓸 수 있으므로 자동 버전에 위임하는 것이 원칙
