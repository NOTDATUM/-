# Biology Exchange · AWS 온라인 서버 배포

## 운영 구조

```text
스태프·1~12조 브라우저
        ↓
GitHub Pages 클라이언트
        ↓ HTTPS
AWS EC2 · Caddy
        ↓
Node 게임 서버 · SQLite
        ↓
EC2 EBS의 Docker 영구 볼륨
```

이 구성에서는 참가자들이 같은 Wi-Fi를 사용할 필요가 없습니다. GitHub Pages는 화면만 제공하고 로그인, 시드머니, 라운드, 주문, 자산과 거래 내역은 모두 AWS 서버가 관리합니다.

## 준비할 AWS 자원

- Ubuntu 24.04 EC2 인스턴스 1대
- 재부팅 후에도 주소가 유지되는 Elastic IP 1개
- API용 도메인 또는 서브도메인 1개(예: `api.example.com`)
- EC2에 연결된 EBS 볼륨

13명이 사용하는 행사 규모라면 단일 EC2 인스턴스로 충분합니다. SQLite DB는 EBS의 Docker 볼륨에 저장되어 서버 재부팅과 애플리케이션 업데이트 후에도 유지됩니다.

## 1. 네트워크 설정

1. EC2에 Elastic IP를 연결합니다.
2. Route 53 또는 사용하는 DNS 서비스에서 API 도메인의 A 레코드를 Elastic IP로 지정합니다.
3. EC2 보안 그룹 인바운드 규칙을 다음과 같이 설정합니다.
   - TCP 80: `0.0.0.0/0`, `::/0`
   - TCP 443: `0.0.0.0/0`, `::/0`
   - UDP 443: `0.0.0.0/0`, `::/0`
   - TCP 22: 관리자 본인의 IP만 허용

게임 서버의 내부 포트 8787은 외부에 공개하지 않습니다.

## 2. EC2에 서버 설치

EC2에 SSH로 접속한 뒤 Docker Engine과 Docker Compose 플러그인을 설치하고, 이 GitHub 저장소를 내려받습니다. 프로젝트 폴더에서 설정 예시를 실제 설정 파일로 복사합니다.

```bash
cp deploy/aws/aws.env.example deploy/aws/aws.env
```

`deploy/aws/aws.env`에서 다음 값을 수정합니다.

- `GAME_DOMAIN`: 준비한 API 도메인
- `TEAM_PASSWORD`: 1~12조 공통 비밀번호
- `STAFF_PASSWORD`: 스태프 비밀번호
- `SESSION_SIGNING_KEY`: 32자 이상의 무작위 문자열
- `ALLOWED_ORIGINS`: `https://notdatum.github.io`

설정 파일은 Git에 올라가지 않습니다.

## 3. 서버 시작

```bash
docker compose --env-file deploy/aws/aws.env -f compose.aws.yaml up -d --build
```

Caddy가 도메인의 HTTPS 인증서를 자동으로 발급하고 Node 게임 서버로 요청을 전달합니다. 다음 주소에서 상태를 확인합니다.

```text
https://준비한-API-도메인/health
```

`{"ok":true}`가 표시되면 서버가 정상입니다.

## 4. GitHub Pages 연결

GitHub 저장소에서 다음을 한 번만 설정합니다.

1. **Settings → Secrets and variables → Actions → Variables**로 이동합니다.
2. Repository variable `BE_API_URL`을 만듭니다.
3. 값에 `https://준비한-API-도메인`을 입력합니다. 끝의 `/`는 생략합니다.
4. **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 선택합니다.
5. **Actions → Deploy GitHub Pages client → Run workflow**를 실행합니다.

배포가 끝나면 GitHub Pages에 접속해 로그인합니다. 모든 브라우저가 동일한 AWS 게임 데이터를 사용합니다.

## 5. 업데이트와 백업

코드를 업데이트할 때는 EC2 프로젝트 폴더에서 새 코드를 받은 뒤 같은 시작 명령을 다시 실행합니다. `docker compose down`은 데이터를 지우지 않지만 `docker compose down -v`는 게임 DB 볼륨을 삭제하므로 사용하지 않습니다.

행사 전에는 EC2 EBS 스냅샷을 하나 만들어 두는 것을 권장합니다. EC2 종료 시 EBS 삭제 옵션은 꺼두고, 인스턴스 종료 방지 기능도 켜두는 편이 안전합니다.

## 행사 전 확인

- 스태프 계정으로 시드머니를 설정합니다.
- 다른 네트워크의 노트북이나 휴대폰에서 1조로 로그인합니다.
- 매수 후 스태프 화면에 약 2초 안에 반영되는지 확인합니다.
- EC2를 재부팅한 뒤에도 거래 데이터가 유지되는지 확인합니다.
- 실제 게임 전에는 시드머니를 다시 확정해 테스트 거래를 초기화합니다.
