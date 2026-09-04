import { LAST_ROUND } from "../../../game-data";
import { readSession } from "../../../lib/session";
import { buildGameSnapshot } from "../route";

export async function POST() {
  const session = await readSession();
  if (!session || session.role !== "view") {
    return Response.json(
      { error: "공용 화면 계정으로 로그인해 주세요." },
      { status: 403 },
    );
  }

  const snapshot = await buildGameSnapshot(session, {
    includeFinalResults: true,
  });
  if (!snapshot.game.started || snapshot.game.round < LAST_ROUND) {
    return Response.json(
      { error: "전체 라운드가 끝난 뒤 결과를 공개할 수 있습니다." },
      { status: 409 },
    );
  }

  return Response.json(
    { finalResults: snapshot.finalResults ?? [] },
    { headers: { "Cache-Control": "no-store" } },
  );
}
