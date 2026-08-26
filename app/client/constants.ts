export const money = new Intl.NumberFormat("ko-KR");

export const MAX_ORDER_QUANTITY = 1_000_000;
export const DEFAULT_TEAM_COUNT = 12;
export const MAX_TEAM_COUNT = 30;
export const CLIENT_THEME_KEY = "be-client-theme";
export const VIEW_THEME_KEY = "be-view-theme";

export const viewRoundBriefs = [
  {
    tags: ["기업 정보", "분산 투자", "초기 포트폴리오"],
    note: "사업 구조와 위험 요인을 비교해 첫 포트폴리오의 균형을 점검하세요.",
  },
  {
    tags: ["학회 성과", "재현성", "기초 연구"],
    note: "초기 연구성과가 공개됐습니다. 단기 반응과 장기 성장성을 구분해 보세요.",
  },
  {
    tags: ["수입 시약", "웻랩 원가", "데이터 기업"],
    note: "실험재료 의존도가 높은 기업과 계산 중심 기업의 비용 구조가 갈립니다.",
  },
  {
    tags: ["신규 변이", "진단·면역", "VACC 상장"],
    note: "감염 대응 기업이 주목받고 백시노바가 시장에 새로 진입합니다.",
  },
  {
    tags: ["감염 우려 해소", "정밀종양학", "테마 전환"],
    note: "직전 라운드의 강세 테마가 빠르게 바뀔 수 있는 전환 구간입니다.",
  },
  {
    tags: ["장기 연구비", "유전체", "코호트"],
    note: "장기 과제와 대규모 데이터 사업에 예산이 유입되는 흐름을 살펴보세요.",
  },
  {
    tags: ["임상 결과", "제조 품질", "종목 차별화"],
    note: "같은 산업 안에서도 임상 성과와 품질 리스크에 따라 격차가 커집니다.",
  },
  {
    tags: ["클라우드 비용", "계산 원가", "웻랩 반등"],
    note: "데이터 처리 비용 상승이 계산 중심 기업의 수익성에 미치는 영향을 확인하세요.",
  },
  {
    tags: ["감염 재확산", "백신", "진단"],
    note: "감염 대응 수요가 다시 늘며 관련 기업으로 관심이 이동합니다.",
  },
  {
    tags: ["백신 안전성", "정밀의료", "대형 수주"],
    note: "안전성 이슈와 신규 수주가 동시에 발생한 혼합 신호 구간입니다.",
  },
  {
    tags: ["기술이전", "최종 평가", "시장 마감"],
    note: "마지막 계약 발표가 반영됩니다. 최종 수익률과 포트폴리오를 확인하세요.",
  },
] as const;

export function clampOrderQuantity(value: number, maximum: number) {
  if (maximum < 1) return 0;
  const integer = Number.isFinite(value) ? Math.floor(value) : 1;
  return Math.min(maximum, Math.max(1, integer));
}
