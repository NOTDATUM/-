export type Stock = {
  ticker: string;
  name: string;
  english: string;
  field: string;
  color: string;
  prices: Array<number | null>;
};

export const stocks: Stock[] = [
  { ticker: "IMMU", name: "이뮤노스피카", english: "ImmunoSpica", field: "면역학", color: "#B7F34C", prices: [120, 149, 127, 184, 129, 152, 140, 147, 206, 165, 223] },
  { ticker: "VIRO", name: "바이로베리타스", english: "ViroVeritas", field: "바이러스학", color: "#63D9FF", prices: [95, 84, 80, 148, 44, 40, 54, 60, 99, 114, 86] },
  { ticker: "PEPT", name: "펩타이드리스", english: "PeptideLys", field: "단백질학", color: "#FFCE69", prices: [110, 119, 93, 107, 171, 192, 163, 192, 207, 259, 389] },
  { ticker: "GENO", name: "지노믹스코리아", english: "GenomicsKorea", field: "유전체학", color: "#A99CFF", prices: [130, 137, 181, 235, 458, 559, 615, 443, 532, 718, 919] },
  { ticker: "SYNP", name: "시냅스코어", english: "SynapseCore", field: "신경과학", color: "#5BE0C2", prices: [85, 82, 103, 77, 104, 135, 119, 83, 71, 84, 102] },
  { ticker: "MICR", name: "마이크로바이옴틱스", english: "Microbiomtics", field: "미생물학", color: "#FF9D67", prices: [75, 84, 60, 63, 35, 44, 35, 38, 43, 40, 52] },
  { ticker: "CANC", name: "캔서세라퓨틱스", english: "CancerTx", field: "암생물학", color: "#FF6B85", prices: [140, 162, 113, 73, 172, 186, 270, 238, 179, 251, 452] },
  { ticker: "CELL", name: "셀바이오제닉스", english: "CellBiogenics", field: "세포생물학", color: "#66A3FF", prices: [100, 94, 56, 45, 54, 62, 56, 68, 61, 68, 58] },
  { ticker: "VACC", name: "백시노바", english: "VacciNova", field: "백신 개발", color: "#F497FF", prices: [null, null, 80, 176, 26, 25, 31, 34, 65, 26, 31] },
];

export const rounds = [
  { label: "장 시작", short: "OPEN", theme: "기준가 공개 · 1라운드 투자", detail: "기업 소개와 힌트를 확인하고 첫 포트폴리오를 구성하세요." },
  { label: "1라운드", short: "R1", theme: "학회·연구성과 공개", detail: "완만한 탐색장 · 재현성과 초기 연구성과가 주목받습니다." },
  { label: "2라운드", short: "R2", theme: "글로벌 시약·배지 공급 충격", detail: "강한 하락장 · 데이터 중심 기업만 상대적 강세입니다." },
  { label: "3라운드", short: "R3", theme: "신규 변이 확산 + 백시노바 상장", detail: "감염 테마 급등 · 백시노바가 신규 상장합니다." },
  { label: "4라운드", short: "R4", theme: "감염 우려 종식 + 정밀종양학 호재", detail: "감염 테마가 무너지고 성장주의 주도권이 바뀝니다." },
  { label: "5라운드", short: "R5", theme: "국가 장기연구 예산 확대", detail: "유전체·뇌과학·코호트 연구에 장기 자금이 유입됩니다." },
  { label: "6라운드", short: "R6", theme: "임상·제조 품질 검증", detail: "임상 성공과 품질 리스크가 종목별 격차를 벌립니다." },
  { label: "7라운드", short: "R7", theme: "클라우드 계산 비용 급등", detail: "데이터 기업이 흔들리고 실험 기반 기업이 반등합니다." },
  { label: "8라운드", short: "R8", theme: "신규 감염 재확산", detail: "백신·진단·면역 테마에 다시 자금이 집중됩니다." },
  { label: "9라운드", short: "R9", theme: "백신 안전성 논란 + 정밀의료 수주", detail: "백신주는 급락하고 유전체·항암 종목이 강세를 보입니다." },
  { label: "10라운드", short: "R10", theme: "최종 기술이전 계약", detail: "마지막 기술이전 발표와 함께 시장이 최종 마감됩니다." },
];

export const LAST_ROUND = 10;

export function getStockPrice(ticker: string, round: number) {
  return stocks.find((stock) => stock.ticker === ticker)?.prices[round] ?? null;
}

export function isStockTradable(ticker: string, round: number) {
  return round < LAST_ROUND && getStockPrice(ticker, round) !== null;
}
