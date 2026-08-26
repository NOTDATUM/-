# 동행 디자인 레퍼런스

조사일: 2026-08-26

## 프로젝트 디자인 방향

- 참가자는 현재 라운드와 시장 흐름을 먼저 이해하고, 보유 자산을 확인한 뒤 매수·매도를 빠르게 완료해야 한다.
- 운영자는 게임 상태, 조별 접속과 자산, 다음 라운드 조작을 한 화면에서 정확하게 관리해야 한다.
- 공용 화면은 빔프로젝터 거리에서도 라운드 이벤트, 시장 차트, 조별 수익률을 즉시 읽을 수 있어야 한다.
- 시각 언어는 차분한 중립색을 기본으로 하고 청록 계열을 주요 행동과 선택 상태에만 제한적으로 사용한다.
- 8px 간격 체계, 명확한 표 정렬, 16px 이상의 일반 본문, 최소 44px의 주요 터치 영역을 기본으로 한다.
- 카드 중첩, 네온 광원, 과도한 그라데이션과 그림자 대신 배경 차이·얇은 경계선·타이포그래피 위계로 정보를 구분한다.
- 역할별 화면의 정보 밀도는 다르게 설계하되, 동일한 색상 의미와 컨트롤 규칙으로 하나의 서비스처럼 느껴지게 한다.

## 참고 사례

### 1. Kahoot! Live Game

- 사이트 또는 제품 이름: Kahoot!
- 참고한 페이지: [How to host a live kahoot](https://support.kahoot.com/hc/en-us/articles/360039422694-How-to-host-a-live-kahoot)
- 참고할 패턴: 진행자와 참가자의 역할을 분리하고, 세션 상태와 다음 행동을 화면 중심에 두는 진행 구조.
- 피할 패턴: 게임 분위기를 위해 여러 강한 색과 애니메이션을 동시에 사용하는 표현.
- 이번 프로젝트에 적용하는 방식: 스태프 화면은 진행 제어와 상태 확인을 우선하고, 조별 화면은 현재 라운드와 주문 행동을 우선하며, 공용 화면은 읽기 전용 요약에 집중한다.

### 2. Mentimeter Live Polling

- 사이트 또는 제품 이름: Mentimeter
- 참고한 페이지: [Live Polling](https://www.mentimeter.com/features/live-polling)
- 참고할 패턴: 발표 화면에서 질문·결과·진행 상태를 큰 글자와 제한된 요소로 전달하는 방식.
- 피할 패턴: 소개 문구가 실제 결과보다 앞서는 마케팅 중심의 첫 화면.
- 이번 프로젝트에 적용하는 방식: View 화면에서 실제 자산은 가리고 수익률, 라운드 이벤트, 시장 차트를 큰 활자와 높은 대비로 배치한다.

### 3. Mobbin

- 사이트 또는 제품 이름: Mobbin
- 참고한 페이지: [Mobbin — Product UI patterns](https://mobbin.com/)
- 참고할 패턴: 실제 제품에서 반복 검증된 탭, 표, 필터, 상태 표시와 모바일 재배치 패턴.
- 피할 패턴: 업종과 사용 맥락을 무시한 채 특정 앱의 표면 스타일을 그대로 모방하는 방식.
- 이번 프로젝트에 적용하는 방식: 전체·단일 차트 전환에는 명확한 선택 상태를, 주문 수량에는 익숙한 스테퍼와 비활성 상태를 사용한다.

### 4. Page Flows

- 사이트 또는 제품 이름: Page Flows
- 참고한 페이지: [Desktop SaaS user flows](https://pageflows.com/screens/desktop/saas/)
- 참고할 패턴: 작업 시작부터 완료·오류 복구까지 이어지는 실제 화면 흐름과 CTA 우선순위.
- 피할 패턴: 하나의 작업을 불필요한 모달과 여러 화면으로 나누어 클릭 수를 늘리는 흐름.
- 이번 프로젝트에 적용하는 방식: 조별 매매는 선택, 수량 조절, 예상 금액, 실행을 같은 문맥에 두고 오류 시 입력값을 유지한다.

### 5. Land-book

- 사이트 또는 제품 이름: Land-book
- 참고한 페이지: [Curated website gallery](https://land-book.com/)
- 참고할 패턴: 콘텐츠에 맞춘 정돈된 그리드, 충분하지만 과도하지 않은 여백, 절제된 시각적 리듬.
- 피할 패턴: 실제 작업보다 큰 히어로 문구와 장식 이미지를 우선하는 랜딩 페이지 구성.
- 이번 프로젝트에 적용하는 방식: 화면마다 일관된 외곽 여백과 컬럼 기준을 사용하고, 첫 화면부터 실제 게임 데이터와 조작을 노출한다.

### 6. SiteInspire

- 사이트 또는 제품 이름: SiteInspire
- 참고한 페이지: [Website inspiration showcase](https://www.siteinspire.com/)
- 참고할 패턴: 제한된 색상, 단단한 타이포그래피 위계, 요소 수를 줄인 명료한 화면 구성.
- 피할 패턴: 감상용 사이트에 적합한 실험적 내비게이션, 비표준 커서, 과도한 전환 효과.
- 이번 프로젝트에 적용하는 방식: 브랜드 개성은 장식보다 시장 데이터, 라운드 상태, 역할별 정보 배열에서 드러내며 탐색 방식은 익숙하게 유지한다.

### 7. GOV.UK Design System

- 사이트 또는 제품 이름: GOV.UK Design System
- 참고한 페이지: [Components](https://design-system.service.gov.uk/components/), [Styles](https://design-system.service.gov.uk/styles/), [Button](https://design-system.service.gov.uk/components/button/)
- 참고할 패턴: 명시적 레이블, 예측 가능한 버튼 위계, 선명한 포커스, 내용 중심의 폼과 오류 안내.
- 피할 패턴: 공공 서비스의 시각 스타일을 그대로 복제하거나 모든 정보를 문서형 화면으로 만드는 방식.
- 이번 프로젝트에 적용하는 방식: 모든 입력에 실제 레이블을 유지하고, 키보드 포커스를 항상 보이게 하며, 주요·보조·위험 행동을 색과 문구로 함께 구분한다.

### 8. Material Design 3

- 사이트 또는 제품 이름: Material Design 3
- 참고한 페이지: [Typography](https://m3.material.io/styles/typography/overview), [Canonical layouts](https://m3.material.io/foundations/layout/canonical-examples/overview), [Touch target size](https://support.google.com/accessibility/android/answer/7101858)
- 참고할 패턴: 제한된 타입 스케일, 반응형 레이아웃 전환, 충분한 조작 영역과 명확한 컴포넌트 상태.
- 피할 패턴: 모든 컨트롤을 Material의 형태와 모션으로 통일해 서비스 고유 맥락을 지우는 방식.
- 이번 프로젝트에 적용하는 방식: 역할별 정보 우선순위를 유지하며 그리드를 재배치하고, 주요 버튼은 44px 안팎의 높이와 disabled·focus·pressed 상태를 제공한다.

### 9. Apple Human Interface Guidelines

- 사이트 또는 제품 이름: Apple Human Interface Guidelines
- 참고한 페이지: [Typography](https://developer.apple.com/design/human-interface-guidelines/typography), [Layout](https://developer.apple.com/design/human-interface-guidelines/layout)
- 참고할 패턴: 읽는 거리와 맥락에 맞춘 활자 크기, 명확한 정렬, 콘텐츠 우선의 적응형 레이아웃.
- 피할 패턴: 넓은 여백과 반투명 재질을 맥락 없이 적용해 정보 밀도를 지나치게 낮추는 방식.
- 이번 프로젝트에 적용하는 방식: 조별 화면은 빠른 시선 이동, 스태프 화면은 조밀한 비교, 공용 화면은 원거리 판독에 맞춰 서로 다른 타입 크기와 밀도를 사용한다.

### 10. WCAG 2.2

- 사이트 또는 제품 이름: W3C Web Content Accessibility Guidelines 2.2
- 참고한 페이지: [WCAG 2.2 Recommendation](https://www.w3.org/TR/WCAG22/), [What's new in WCAG 2.2](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/)
- 참고할 패턴: 텍스트 대비, 키보드 접근, 보이는 포커스, 최소 타깃 크기, 일관된 도움과 오류 식별.
- 피할 패턴: 색상만으로 등락·접속·오류 상태를 전달하거나 작은 보조 텍스트를 장시간 읽게 하는 방식.
- 이번 프로젝트에 적용하는 방식: WCAG 2.2 AA 대비를 목표로 하고, 등락에는 부호와 색을 함께 쓰며, 스킵 링크·시맨틱 제목·접근 가능한 이름·reduced motion 대응을 구현한다.

## 공통 결론

- 세 역할 모두 `현재 상태 → 핵심 정보 → 다음 행동` 순서가 가장 빠르게 이해된다.
- 참가자 화면은 거래 속도, 스태프 화면은 비교와 제어, View 화면은 원거리 판독을 우선해야 한다.
- 데이터가 많은 화면은 카드 수를 늘리기보다 표, 정렬, 배경 단계, 구분선으로 구조화하는 편이 낫다.
- 데스크톱을 단순 축소하지 않고, 작은 화면에서는 콘텐츠 순서를 재배치하되 기능을 제거하지 않는다.
- 애니메이션은 차트 축 변화, 메뉴 열림, 저장 상태처럼 변화의 원인을 이해시키는 경우에만 짧게 사용한다.
- 외부 사례는 정보 구조와 접근성 원칙만 참고하며 특정 브랜드의 레이아웃, 문구, 색상, 코드를 복제하지 않는다.
