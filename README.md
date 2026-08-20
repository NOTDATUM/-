# Biology Exchange

생명과학부 레크리에이션용 12개 조 모의주식 서비스입니다.

## 운영 구조

- **GitHub Pages 클라이언트**: 로그인, 차트, 주문, 스태프 진행 화면
- **공용 Node 게임 서버**: 인증, 권한, 라운드, 주문 검증, 자산 계산
- **SQLite 데이터베이스**: 게임 상태와 12개 조의 거래를 영구 저장

클라이언트는 2초마다 공용 서버를 확인하므로 참가자들이 서로 다른 네트워크에 있어도 같은 게임을 진행할 수 있습니다.

## 주요 명령

```bash
npm install
npm run dev
npm run build:pages
npm run server:remote
npm test
```

AWS 배포 절차는 [`AWS_배포방법.md`](./AWS_배포방법.md)를 참고하세요.
