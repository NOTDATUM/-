import { HttpError } from "./http.mjs";

export function createRequestHandler({ http, sessions, game }) {
  const { corsOrigin, setCommonHeaders, sendJson, readJson } = http;
  const { authenticate, createSessionToken, publicSession, readSession } =
    sessions;
  const {
    gameSnapshot,
    setupGame,
    forceLogoutTeam,
    updateHintCoins,
    startGame,
    resetGame,
    updateFuturePrices,
    advanceRound,
    executeTrade,
    cancelTrade,
  } = game;

  return async function handleRequest(request, response) {
    let origin = null;
    try {
      origin = corsOrigin(request);
      if (request.method === "OPTIONS") {
        setCommonHeaders(response, origin);
        response.statusCode = 204;
        response.end();
        return;
      }

      const pathname =
        new URL(request.url ?? "/", "http://localhost").pathname.replace(
          /\/$/,
          "",
        ) || "/";

      if (
        request.method === "GET" &&
        (pathname === "/" || pathname === "/health")
      ) {
        sendJson(
          response,
          200,
          { ok: true, service: "Biology Exchange game server" },
          origin,
        );
        return;
      }

      if (pathname === "/api/auth" && request.method === "POST") {
        const body = await readJson(request);
        const id = String(body.id ?? "").trim();
        const password = String(body.password ?? "");
        const session = authenticate(id, password);
        if (!session) {
          throw new HttpError(401, "아이디 또는 비밀번호가 올바르지 않습니다.");
        }
        sendJson(
          response,
          200,
          {
            session: publicSession(session),
            token: createSessionToken(session),
          },
          origin,
        );
        return;
      }

      if (pathname === "/api/auth" && request.method === "DELETE") {
        const logoutSession = readSession(request, { touch: false });
        if (logoutSession?.role === "team") {
          forceLogoutTeam(logoutSession.teamId, { audit: false });
        }
        sendJson(response, 200, { ok: true }, origin);
        return;
      }

      const session = readSession(request);
      if (!session) throw new HttpError(401, "로그인이 필요합니다.");

      if (pathname === "/api/auth" && request.method === "GET") {
        sendJson(response, 200, { session: publicSession(session) }, origin);
        return;
      }
      if (pathname === "/api/game" && request.method === "GET") {
        sendJson(response, 200, gameSnapshot(session), origin);
        return;
      }
      if (pathname === "/api/game/setup" && request.method === "POST") {
        if (session.role !== "staff") {
          throw new HttpError(403, "스태프 권한이 필요합니다.");
        }
        setupGame((await readJson(request)).seeds);
        sendJson(response, 200, { ok: true }, origin);
        return;
      }
      if (pathname === "/api/game/start" && request.method === "POST") {
        if (session.role !== "staff") {
          throw new HttpError(403, "스태프 권한이 필요합니다.");
        }
        sendJson(response, 200, startGame(), origin);
        return;
      }
      if (pathname === "/api/game/reset" && request.method === "POST") {
        if (session.role !== "staff") {
          throw new HttpError(403, "스태프 권한이 필요합니다.");
        }
        resetGame();
        sendJson(response, 200, { ok: true }, origin);
        return;
      }
      if (pathname === "/api/game/prices" && request.method === "POST") {
        if (session.role !== "staff") {
          throw new HttpError(403, "스태프 권한이 필요합니다.");
        }
        const updated = updateFuturePrices((await readJson(request)).updates);
        sendJson(response, 200, { ok: true, updated }, origin);
        return;
      }
      if (pathname === "/api/game/force-logout" && request.method === "POST") {
        if (session.role !== "staff") {
          throw new HttpError(403, "스태프 권한이 필요합니다.");
        }
        const teamId = Number((await readJson(request)).teamId);
        forceLogoutTeam(teamId);
        sendJson(response, 200, { ok: true, teamId }, origin);
        return;
      }
      if (pathname === "/api/game/hint-coins" && request.method === "POST") {
        if (session.role !== "staff") {
          throw new HttpError(403, "스태프 권한이 필요합니다.");
        }
        const body = await readJson(request);
        const result = updateHintCoins(
          Number(body.teamId),
          Number(body.hintCoins),
        );
        sendJson(response, 200, { ok: true, ...result }, origin);
        return;
      }
      if (pathname === "/api/game/round" && request.method === "POST") {
        if (session.role !== "staff") {
          throw new HttpError(403, "스태프 권한이 필요합니다.");
        }
        sendJson(response, 200, { round: advanceRound() }, origin);
        return;
      }
      if (pathname === "/api/game/cancel-trade" && request.method === "POST") {
        if (session.role !== "staff") {
          throw new HttpError(403, "스태프 권한이 필요합니다.");
        }
        const tradeId = Number((await readJson(request)).tradeId);
        sendJson(response, 200, { ok: true, ...cancelTrade(tradeId) }, origin);
        return;
      }
      if (pathname === "/api/game/trade" && request.method === "POST") {
        if (session.role !== "team") {
          throw new HttpError(403, "조 계정으로 로그인해 주세요.");
        }
        const result = executeTrade(session.teamId, await readJson(request));
        sendJson(response, 200, { ok: true, ...result }, origin);
        return;
      }

      throw new HttpError(404, "요청한 경로를 찾을 수 없습니다.");
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      const message =
        error instanceof HttpError
          ? error.message
          : "게임 서버에서 오류가 발생했습니다.";
      if (!(error instanceof HttpError)) console.error(error);
      if (!response.headersSent) {
        sendJson(response, status, { error: message }, origin);
      } else {
        response.end();
      }
    }
  };
}
