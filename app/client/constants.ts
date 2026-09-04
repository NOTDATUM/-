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
    tags: ["통합생명과학학회", "기업·연구실 협업", "공동연구"],
    note: "학회 개막으로 여러 분야의 연구 성과가 공유되고 공동연구 기회가 늘어나는 구간입니다.",
  },
  {
    tags: ["실험 물자 공급난", "웻랩 가동 중단", "데이터·연산 수요"],
    note: "실험실 운영 차질과 반대로 성장하는 데이터 분석·계산 분야를 함께 살펴보세요.",
  },
  {
    tags: ["호흡기 감염 급증", "예산 우선순위 전환", "VACC 공모가 50 BE"],
    note: "감염 대응으로 이동한 예산과 심의 인력을 확인하세요. VACC는 다음 투자 구간부터 거래됩니다.",
  },
  {
    tags: ["자금·발주 재개", "물자 공급 정상화", "장기계약"],
    note: "중단됐던 자금 집행과 공급망이 정상화되며 밀린 발주와 심사가 한꺼번에 재개됩니다.",
  },
  {
    tags: ["정부 합동 감사", "자료 검증", "시설·인허가 점검"],
    note: "감사와 규제 강화가 기업의 연구 기록, 제조시설 안전과 인허가 관리에 미칠 영향을 확인하세요.",
  },
  {
    tags: ["기록적 폭염", "농축산 피해", "고온 대응 수요"],
    note: "기후 충격에 취약한 산업과 피해 대응에 필요한 고온 적응·생태 기술을 함께 살펴보세요.",
  },
  {
    tags: ["신종 인수공통감염병", "긴급 대응 물자", "파지 치료"],
    note: "감염 확산에 즉시 대응할 수 있는 진단·물자 공급과 파지 치료 역량이 핵심입니다.",
  },
] as const;

export function clampOrderQuantity(value: number, maximum: number) {
  if (maximum < 1) return 0;
  const integer = Number.isFinite(value) ? Math.floor(value) : 1;
  return Math.min(maximum, Math.max(1, integer));
}
