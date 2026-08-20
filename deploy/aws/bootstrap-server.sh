#!/usr/bin/env bash

set -Eeuo pipefail

APP_DIR="/opt/biology-exchange"
REPOSITORY_URL="https://github.com/NOTDATUM/-.git"
ALLOWED_ORIGINS="https://notdatum.github.io"

log() {
  printf '\n[%s] %s\n' "Biology Exchange" "$1"
}

fail() {
  printf '\n오류: %s\n' "$1" >&2
  exit 1
}

if [[ "${EUID}" -ne 0 ]]; then
  fail "이 설치 스크립트는 sudo로 실행해야 합니다."
fi

if [[ ! -r /etc/os-release ]]; then
  fail "운영체제 정보를 확인할 수 없습니다. Ubuntu 22.04/24.04 또는 Amazon Linux 2023을 사용해 주세요."
fi

# shellcheck disable=SC1091
source /etc/os-release

install_compose_plugin() {
  local machine compose_arch compose_version compose_url
  machine="$(uname -m)"

  case "${machine}" in
    x86_64) compose_arch="x86_64" ;;
    aarch64|arm64) compose_arch="aarch64" ;;
    *) fail "Docker Compose를 자동 설치할 수 없는 CPU 구조입니다: ${machine}" ;;
  esac

  compose_version="$(curl -fsSLI -o /dev/null -w '%{url_effective}' https://github.com/docker/compose/releases/latest | awk -F/ '{print $NF}')"
  [[ "${compose_version}" == v* ]] || fail "Docker Compose 최신 버전을 확인하지 못했습니다."

  compose_url="https://github.com/docker/compose/releases/download/${compose_version}/docker-compose-linux-${compose_arch}"
  install -m 0755 -d /usr/local/lib/docker/cli-plugins
  curl -fsSL "${compose_url}" -o /usr/local/lib/docker/cli-plugins/docker-compose
  chmod 0755 /usr/local/lib/docker/cli-plugins/docker-compose
}

install_docker_debian() {
  log "Docker와 필수 도구를 설치합니다."
  apt-get update
  apt-get install -y ca-certificates curl git openssl
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/${ID}/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc

  printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/%s %s stable\n' \
    "$(dpkg --print-architecture)" "${ID}" "${VERSION_CODENAME}" \
    > /etc/apt/sources.list.d/docker.list

  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
}

install_docker_amazon() {
  log "Docker와 필수 도구를 설치합니다."
  dnf install -y docker git curl openssl
  if ! dnf install -y docker-compose-plugin; then
    log "Docker Compose 플러그인을 공식 릴리스에서 설치합니다."
    install_compose_plugin
  fi
}

if ! command -v docker >/dev/null 2>&1; then
  case "${ID}" in
    ubuntu|debian) install_docker_debian ;;
    amzn) install_docker_amazon ;;
    *) fail "지원하지 않는 운영체제입니다: ${PRETTY_NAME:-${ID}}" ;;
  esac
else
  log "이미 설치된 Docker를 사용합니다."
  case "${ID}" in
    ubuntu|debian) apt-get update && apt-get install -y ca-certificates git curl openssl ;;
    amzn) dnf install -y git curl openssl ;;
    *) fail "지원하지 않는 운영체제입니다: ${PRETTY_NAME:-${ID}}" ;;
  esac
fi

systemctl enable --now docker

if ! docker compose version >/dev/null 2>&1; then
  log "Docker Compose 플러그인을 설치합니다."
  install_compose_plugin
fi

log "게임 서버 코드를 준비합니다."
if [[ -d "${APP_DIR}/.git" ]]; then
  git -C "${APP_DIR}" pull --ff-only origin main
elif [[ -e "${APP_DIR}" ]]; then
  fail "${APP_DIR} 경로가 이미 존재하지만 Git 저장소가 아닙니다."
else
  git clone --branch main "${REPOSITORY_URL}" "${APP_DIR}"
fi

metadata_token="$(curl -fsS --connect-timeout 2 -X PUT \
  -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' \
  http://169.254.169.254/latest/api/token 2>/dev/null || true)"

public_ip=""
if [[ -n "${metadata_token}" ]]; then
  public_ip="$(curl -fsS --connect-timeout 2 \
    -H "X-aws-ec2-metadata-token: ${metadata_token}" \
    http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || true)"
fi

if [[ -z "${public_ip}" ]]; then
  public_ip="$(curl -fsS --connect-timeout 5 https://checkip.amazonaws.com 2>/dev/null | tr -d '[:space:]' || true)"
fi

if [[ ! "${public_ip}" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
  fail "EC2 공인 IPv4 주소를 자동으로 확인하지 못했습니다."
fi

game_domain="${public_ip//./-}.sslip.io"

printf '\n아래 비밀번호에서 Enter만 누르면 대괄호 안의 기존 값을 사용합니다.\n' >/dev/tty
read -r -s -p '1~12조 공통 비밀번호 [donghaeng]: ' team_password </dev/tty
printf '\n' >/dev/tty
read -r -s -p '스태프 비밀번호 [12345678]: ' staff_password </dev/tty
printf '\n' >/dev/tty

team_password="${team_password:-donghaeng}"
staff_password="${staff_password:-12345678}"

if [[ "${team_password}" == *$'\n'* || "${team_password}" == *$'\r'* || \
      "${staff_password}" == *$'\n'* || "${staff_password}" == *$'\r'* ]]; then
  fail "비밀번호에는 줄바꿈 문자를 사용할 수 없습니다."
fi

session_signing_key="$(openssl rand -hex 32)"
env_file="${APP_DIR}/deploy/aws/aws.env"
umask 077
{
  printf 'GAME_DOMAIN=%s\n' "${game_domain}"
  printf 'ALLOWED_ORIGINS=%s\n' "${ALLOWED_ORIGINS}"
  printf 'TEAM_PASSWORD=%s\n' "${team_password}"
  printf 'STAFF_PASSWORD=%s\n' "${staff_password}"
  printf 'SESSION_SIGNING_KEY=%s\n' "${session_signing_key}"
} > "${env_file}"

log "게임 서버와 HTTPS 프록시를 시작합니다."
cd "${APP_DIR}"
docker compose --env-file deploy/aws/aws.env -f compose.aws.yaml up -d --build

health_url="https://${game_domain}/health"
log "HTTPS 연결을 확인합니다. 인증서 발급에는 잠시 시간이 걸릴 수 있습니다."

for attempt in $(seq 1 30); do
  if curl -fsS --connect-timeout 3 --max-time 5 "${health_url}" >/dev/null 2>&1; then
    printf '\n설치 완료!\n게임 서버: https://%s\n상태 확인: %s\n' "${game_domain}" "${health_url}"
    exit 0
  fi
  sleep 2
done

docker compose --env-file deploy/aws/aws.env -f compose.aws.yaml ps
printf '\n서버 컨테이너는 실행됐지만 HTTPS 상태 확인이 아직 끝나지 않았습니다.\n'
printf '1~2분 뒤 브라우저에서 %s 를 열어 보세요.\n' "${health_url}"
