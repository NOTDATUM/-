import { HttpError } from "./http.mjs";

export function createGameService({
  db,
  stocks,
  lastRound,
  defaultSeedMoney,
  maxTeamCount,
  publicSession,
}) {
  function recordAdminAction(action, summary, details = null) {
    db.prepare(
      "INSERT INTO admin_audit_logs (actor, action, summary, details) VALUES ('staff', ?, ?, ?)",
    ).run(action, summary, details === null ? null : JSON.stringify(details));
  }

  function parseAuditDetails(details) {
    if (!details) return null;
    try {
      return JSON.parse(details);
    } catch {
      return null;
    }
  }

  function transaction(work) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  function getStockPrice(ticker, round) {
    const row = db
      .prepare(
        "SELECT price FROM price_schedule WHERE ticker = ? AND round = ?",
      )
      .get(ticker, round);
    return row?.price ?? null;
  }

  function isStockTradable(ticker, round) {
    return round < lastRound && (getStockPrice(ticker, round) ?? 0) > 0;
  }

  function gameSnapshot(session) {
    const game = db
      .prepare("SELECT round, started, updated_at FROM game_state WHERE id = 1")
      .get() ?? { round: 0, started: 0, updated_at: "" };
    const teams = db
      .prepare(
        "SELECT team_id, seed_money, cash, hint_coins FROM teams ORDER BY team_id",
      )
      .all();
    const holdings = db
      .prepare(
        "SELECT team_id, ticker, shares FROM holdings WHERE shares > 0 ORDER BY team_id, ticker",
      )
      .all();
    const trades = db
      .prepare(
        "SELECT id, team_id, ticker, action, quantity, price, round, created_at, canceled_at FROM trades ORDER BY id DESC LIMIT 500",
      )
      .all();
    const auditRows =
      session.role === "staff"
        ? db
            .prepare(
              "SELECT id, actor, action, summary, details, created_at FROM admin_audit_logs ORDER BY id DESC LIMIT 100",
            )
            .all()
        : [];
    const priceRows = db
      .prepare(
        "SELECT ticker, round, price FROM price_schedule ORDER BY ticker, round",
      )
      .all();
    const presenceRows = db
      .prepare(
        `SELECT team_id, last_seen_at,
    CASE WHEN last_seen_at IS NOT NULL AND last_seen_at >= datetime('now', '-12 seconds') THEN 1 ELSE 0 END AS online
    FROM team_sessions`,
      )
      .all();
    const fullPrices = Object.fromEntries(
      stocks.map((stock) => [
        stock.ticker,
        Array.from(
          { length: lastRound + 1 },
          (_, round) =>
            priceRows.find(
              (row) => row.ticker === stock.ticker && row.round === round,
            )?.price ?? null,
        ),
      ]),
    );
    const teamViews = teams.map((team) => {
      const teamHoldings = holdings.filter(
        (holding) => holding.team_id === team.team_id,
      );
      const stockValue = teamHoldings.reduce(
        (sum, holding) =>
          sum +
          holding.shares * (fullPrices[holding.ticker]?.[game.round] ?? 0),
        0,
      );
      return {
        teamId: team.team_id,
        seedMoney: team.seed_money,
        cash: team.cash,
        hintCoins: team.hint_coins,
        totalAsset: team.cash + stockValue,
        holdings: Object.fromEntries(
          teamHoldings.map((holding) => [holding.ticker, holding.shares]),
        ),
        trades: trades.filter(
          (trade) =>
            trade.team_id === team.team_id &&
            (session.role === "staff" || trade.canceled_at === null),
        ),
        online: Boolean(
          presenceRows.find((presence) => presence.team_id === team.team_id)
            ?.online,
        ),
        lastSeenAt:
          presenceRows.find((presence) => presence.team_id === team.team_id)
            ?.last_seen_at ?? null,
      };
    });
    return {
      session: publicSession(session),
      game: {
        round: game.round,
        started: Boolean(game.started),
        updatedAt: game.updated_at,
      },
      market: {
        prices:
          session.role === "staff"
            ? fullPrices
            : Object.fromEntries(
                Object.entries(fullPrices).map(([ticker, prices]) => [
                  ticker,
                  prices.map((price, round) =>
                    round <= game.round ? price : null,
                  ),
                ]),
              ),
      },
      team:
        session.role === "team"
          ? (teamViews.find((team) => team.teamId === session.teamId) ?? null)
          : null,
      teams:
        session.role === "staff"
          ? teamViews
          : session.role === "view"
            ? teamViews.map(({ teamId, seedMoney, totalAsset }) => ({
                teamId,
                returnRate: seedMoney
                  ? Math.round(
                      ((totalAsset - seedMoney) / seedMoney) * 100 * 100,
                    ) / 100
                  : 0,
              }))
            : null,
      auditLogs:
        session.role === "staff"
          ? auditRows.map((log) => ({
              id: log.id,
              actor: log.actor,
              action: log.action,
              summary: log.summary,
              details: parseAuditDetails(log.details),
              createdAt: log.created_at,
            }))
          : null,
    };
  }

  function setupGame(seeds) {
    if (
      !Array.isArray(seeds) ||
      seeds.length < 1 ||
      seeds.length > maxTeamCount ||
      seeds.some(
        (value) => !Number.isInteger(value) || value < 1 || value > 100_000_000,
      )
    ) {
      throw new HttpError(
        400,
        `1개 이상 ${maxTeamCount}개 이하의 조와 올바른 시드머니를 입력해 주세요.`,
      );
    }
    transaction(() => {
      db.exec("DELETE FROM holdings; DELETE FROM trades;");
      db.prepare(
        "UPDATE team_sessions SET session_version = session_version + 1, last_seen_at = NULL WHERE team_id > ?",
      ).run(seeds.length);
      db.prepare(
        "UPDATE game_state SET round = 0, started = 0, updated_at = CURRENT_TIMESTAMP WHERE id = 1",
      ).run();
      db.prepare("DELETE FROM teams").run();
      const insertTeam = db.prepare(
        "INSERT INTO teams (team_id, seed_money, cash) VALUES (?, ?, ?)",
      );
      const insertTeamSession = db.prepare(
        "INSERT OR IGNORE INTO team_sessions (team_id, session_version, last_seen_at) VALUES (?, 0, NULL)",
      );
      seeds.forEach((seed, index) => {
        insertTeam.run(index + 1, seed, seed);
        insertTeamSession.run(index + 1);
      });
      db.prepare("DELETE FROM sqlite_sequence WHERE name = 'trades'").run();
      recordAdminAction(
        "game_setup",
        `${seeds.length}개 조 게임 구성을 저장했습니다.`,
        { teamCount: seeds.length, seeds },
      );
    });
  }

  function forceLogoutTeam(teamId, { audit = true } = {}) {
    if (
      !Number.isInteger(teamId) ||
      teamId < 1 ||
      teamId > maxTeamCount ||
      !db
        .prepare("SELECT 1 AS present FROM teams WHERE team_id = ?")
        .get(teamId)
    ) {
      throw new HttpError(400, "로그아웃할 조를 다시 확인해 주세요.");
    }
    transaction(() => {
      db.prepare(
        "UPDATE team_sessions SET session_version = session_version + 1, last_seen_at = NULL WHERE team_id = ?",
      ).run(teamId);
      if (audit)
        recordAdminAction(
          "force_logout",
          `${teamId}조를 강제 로그아웃했습니다.`,
          { teamId },
        );
    });
  }

  function updateHintCoins(teamId, hintCoins) {
    if (
      !Number.isInteger(teamId) ||
      !Number.isInteger(hintCoins) ||
      hintCoins < 0 ||
      hintCoins > 1_000_000_000
    ) {
      throw new HttpError(400, "힌트코인 수량을 다시 확인해 주세요.");
    }
    return transaction(() => {
      const team = db
        .prepare("SELECT hint_coins FROM teams WHERE team_id = ?")
        .get(teamId);
      if (!team) throw new HttpError(404, "해당 조를 찾을 수 없습니다.");
      db.prepare("UPDATE teams SET hint_coins = ? WHERE team_id = ?").run(
        hintCoins,
        teamId,
      );
      db.prepare(
        "UPDATE game_state SET updated_at = CURRENT_TIMESTAMP WHERE id = 1",
      ).run();
      recordAdminAction(
        "hint_coins_update",
        `${teamId}조 힌트코인을 ${hintCoins}개로 변경했습니다.`,
        {
          teamId,
          previousHintCoins: team.hint_coins,
          hintCoins,
          delta: hintCoins - team.hint_coins,
        },
      );
      return { teamId, hintCoins };
    });
  }

  function startGame() {
    return transaction(() => {
      const game = db
        .prepare("SELECT round, started FROM game_state WHERE id = 1")
        .get();
      if (!game) throw new HttpError(500, "게임 상태를 불러오지 못했습니다.");
      if (game.started) throw new HttpError(409, "이미 게임이 시작되었습니다.");
      db.prepare(
        "UPDATE game_state SET round = 0, started = 1, updated_at = CURRENT_TIMESTAMP WHERE id = 1",
      ).run();
      recordAdminAction("game_start", "게임을 시작했습니다.", { round: 0 });
      return { round: 0, started: true };
    });
  }

  function resetGame() {
    transaction(() => {
      db.exec(
        "DELETE FROM holdings; DELETE FROM trades; DELETE FROM admin_audit_logs;",
      );
      db.prepare(
        "UPDATE teams SET seed_money = ?, cash = ?, hint_coins = 0",
      ).run(
        defaultSeedMoney,
        defaultSeedMoney,
      );
      db.prepare(
        "UPDATE game_state SET round = 0, started = 0, updated_at = CURRENT_TIMESTAMP WHERE id = 1",
      ).run();
      db.prepare(
        "DELETE FROM sqlite_sequence WHERE name IN ('trades', 'admin_audit_logs')",
      ).run();
    });
  }

  function updateFuturePrices(updates) {
    if (
      !Array.isArray(updates) ||
      updates.length < 1 ||
      updates.length > stocks.length * (lastRound + 1)
    ) {
      throw new HttpError(400, "수정할 주가를 다시 확인해 주세요.");
    }
    return transaction(() => {
      const game = db
        .prepare("SELECT round, started FROM game_state WHERE id = 1")
        .get();
      if (!game) throw new HttpError(500, "게임 상태를 불러오지 못했습니다.");
      const firstEditableRound = game.started ? game.round + 1 : 0;
      const normalized = updates.map((item) => {
        const ticker = String(item?.ticker ?? "");
        const round = Number(item?.round);
        const price = item?.price === null ? null : Number(item?.price);
        if (
          !stocks.some((stock) => stock.ticker === ticker) ||
          !Number.isInteger(round) ||
          round < firstEditableRound ||
          round > lastRound ||
          (price !== null &&
            (!Number.isInteger(price) || price < 0 || price > 100_000_000))
        ) {
          throw new HttpError(
            400,
            "진행되지 않은 라운드의 올바른 주가만 수정할 수 있습니다.",
          );
        }
        return { ticker, round, price };
      });
      const updatePrice = db.prepare(
        "UPDATE price_schedule SET price = ? WHERE ticker = ? AND round = ?",
      );
      normalized.forEach((item) =>
        updatePrice.run(item.price, item.ticker, item.round),
      );
      db.prepare(
        "UPDATE game_state SET updated_at = CURRENT_TIMESTAMP WHERE id = 1",
      ).run();
      recordAdminAction(
        "price_update",
        `미공개 주가 ${normalized.length}개를 수정했습니다.`,
        { updates: normalized },
      );
      return normalized.length;
    });
  }

  function advanceRound() {
    return transaction(() => {
      const game = db
        .prepare("SELECT round, started FROM game_state WHERE id = 1")
        .get();
      if (!game?.started)
        throw new HttpError(
          400,
          "먼저 시드머니를 설정해 게임을 시작해 주세요.",
        );
      if (game.round >= lastRound)
        throw new HttpError(400, "모든 라운드가 종료되었습니다.");
      const nextRound = game.round + 1;
      db.prepare(
        "UPDATE game_state SET round = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1",
      ).run(nextRound);
      recordAdminAction("round_advance", `${nextRound}라운드를 공개했습니다.`, {
        previousRound: game.round,
        round: nextRound,
      });
      return nextRound;
    });
  }

  function executeTrade(teamId, body) {
    const ticker = String(body.ticker ?? "");
    const action = body.action;
    const quantity = Number(body.quantity);
    if (
      !stocks.some((stock) => stock.ticker === ticker) ||
      (action !== "buy" && action !== "sell") ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 1_000_000
    ) {
      throw new HttpError(400, "주문 내용을 다시 확인해 주세요.");
    }

    return transaction(() => {
      const game = db
        .prepare("SELECT round, started FROM game_state WHERE id = 1")
        .get();
      if (!game?.started)
        throw new HttpError(400, "아직 게임이 시작되지 않았습니다.");
      if (!isStockTradable(ticker, game.round))
        throw new HttpError(400, "현재 거래할 수 없는 종목입니다.");
      const price = getStockPrice(ticker, game.round);
      if (price === null) throw new HttpError(400, "현재 가격이 없습니다.");

      const team = db
        .prepare("SELECT cash FROM teams WHERE team_id = ?")
        .get(teamId);
      const holding = db
        .prepare("SELECT shares FROM holdings WHERE team_id = ? AND ticker = ?")
        .get(teamId, ticker);
      const shares = holding?.shares ?? 0;
      const total = price * quantity;
      if (action === "buy" && (!team || team.cash < total))
        throw new HttpError(400, "보유 BE Coin이 부족합니다.");
      if (action === "sell" && shares < quantity)
        throw new HttpError(400, "보유한 수량보다 많이 팔 수 없습니다.");

      const nextCash = team.cash + (action === "buy" ? -total : total);
      const nextShares = shares + (action === "buy" ? quantity : -quantity);
      db.prepare("UPDATE teams SET cash = ? WHERE team_id = ?").run(
        nextCash,
        teamId,
      );
      db.prepare(
        `INSERT INTO holdings (team_id, ticker, shares) VALUES (?, ?, ?)
      ON CONFLICT(team_id, ticker) DO UPDATE SET shares = excluded.shares`,
      ).run(teamId, ticker, nextShares);
      db.prepare(
        "INSERT INTO trades (team_id, ticker, action, quantity, price, round) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(teamId, ticker, action, quantity, price, game.round);
      db.prepare(
        "UPDATE game_state SET updated_at = CURRENT_TIMESTAMP WHERE id = 1",
      ).run();
      return { price, quantity, action };
    });
  }

  function cancelTrade(tradeId) {
    if (!Number.isInteger(tradeId) || tradeId < 1)
      throw new HttpError(400, "취소할 거래를 다시 확인해 주세요.");
    return transaction(() => {
      const trade = db
        .prepare(
          `SELECT id, team_id, ticker, action, quantity, price, round, canceled_at
      FROM trades WHERE id = ?`,
        )
        .get(tradeId);
      if (!trade) throw new HttpError(404, "거래 내역을 찾을 수 없습니다.");
      if (trade.canceled_at)
        throw new HttpError(409, "이미 취소된 거래입니다.");
      const team = db
        .prepare("SELECT cash FROM teams WHERE team_id = ?")
        .get(trade.team_id);
      const holding = db
        .prepare("SELECT shares FROM holdings WHERE team_id = ? AND ticker = ?")
        .get(trade.team_id, trade.ticker);
      if (!team) throw new HttpError(404, "거래 조를 찾을 수 없습니다.");
      const shares = holding?.shares ?? 0;
      const total = trade.quantity * trade.price;
      if (trade.action === "buy" && shares < trade.quantity) {
        throw new HttpError(
          409,
          "이후 매도로 보유 수량이 부족해 해당 매수를 취소할 수 없습니다.",
        );
      }
      if (trade.action === "sell" && team.cash < total) {
        throw new HttpError(
          409,
          "이후 거래로 현금이 부족해 해당 매도를 취소할 수 없습니다.",
        );
      }
      const nextCash = team.cash + (trade.action === "buy" ? total : -total);
      const nextShares =
        shares + (trade.action === "buy" ? -trade.quantity : trade.quantity);
      db.prepare("UPDATE teams SET cash = ? WHERE team_id = ?").run(
        nextCash,
        trade.team_id,
      );
      db.prepare(
        `INSERT INTO holdings (team_id, ticker, shares) VALUES (?, ?, ?)
      ON CONFLICT(team_id, ticker) DO UPDATE SET shares = excluded.shares`,
      ).run(trade.team_id, trade.ticker, nextShares);
      db.prepare(
        "UPDATE trades SET canceled_at = CURRENT_TIMESTAMP WHERE id = ?",
      ).run(trade.id);
      db.prepare(
        "UPDATE game_state SET updated_at = CURRENT_TIMESTAMP WHERE id = 1",
      ).run();
      recordAdminAction(
        "trade_cancel",
        `${trade.team_id}조 ${trade.ticker} ${trade.action === "buy" ? "매수" : "매도"} 거래를 취소했습니다.`,
        {
          tradeId: trade.id,
          teamId: trade.team_id,
          ticker: trade.ticker,
          action: trade.action,
          quantity: trade.quantity,
          price: trade.price,
          round: trade.round,
        },
      );
      return { tradeId: trade.id, teamId: trade.team_id };
    });
  }

  return {
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
  };
}
