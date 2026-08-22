import { createHmac, timingSafeEqual } from "node:crypto";

function safeEqualText(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function createSessionService({
  db,
  signingKey,
  maxTeamCount,
  teamPassword,
  staffPassword,
  viewPassword,
}) {
  function authenticate(id, password) {
    let session = null;
    if (id === "staff" && safeEqualText(password, staffPassword)) {
      session = { role: "staff", teamId: null, sessionVersion: null };
    }
    if (id === "view" && safeEqualText(password, viewPassword)) {
      session = { role: "view", teamId: null, sessionVersion: null };
    }

    const teamId = Number(id);
    const teamExists =
      Number.isInteger(teamId) &&
      teamId >= 1 &&
      teamId <= maxTeamCount &&
      db
        .prepare("SELECT 1 AS present FROM teams WHERE team_id = ?")
        .get(teamId);
    if (
      /^\d{1,2}$/.test(id) &&
      teamExists &&
      safeEqualText(password, teamPassword)
    ) {
      db.prepare(
        "INSERT OR IGNORE INTO team_sessions (team_id, session_version, last_seen_at) VALUES (?, 0, NULL)",
      ).run(teamId);
      const sessionState = db
        .prepare("SELECT session_version FROM team_sessions WHERE team_id = ?")
        .get(teamId);
      db.prepare(
        "UPDATE team_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE team_id = ?",
      ).run(teamId);
      session = {
        role: "team",
        teamId,
        sessionVersion: sessionState.session_version,
      };
    }
    return session;
  }

  function createSessionToken(session) {
    const payload = Buffer.from(
      JSON.stringify({
        role: session.role,
        teamId: session.teamId,
        sessionVersion: session.sessionVersion,
        exp: Date.now() + 18 * 60 * 60 * 1000,
      }),
    ).toString("base64url");
    const signature = createHmac("sha256", signingKey)
      .update(payload)
      .digest("base64url");
    return `${payload}.${signature}`;
  }

  function publicSession(session) {
    if (session.role === "team")
      return { role: "team", teamId: session.teamId };
    return { role: session.role, teamId: null };
  }

  function readSession(request, { touch = true } = {}) {
    const authorization = request.headers.authorization ?? "";
    if (!authorization.startsWith("Bearer ")) return null;
    const token = authorization.slice(7);
    const split = token.lastIndexOf(".");
    if (split < 1) return null;
    const payload = token.slice(0, split);
    const signature = token.slice(split + 1);
    const expected = createHmac("sha256", signingKey)
      .update(payload)
      .digest("base64url");
    if (!safeEqualText(signature, expected)) return null;
    try {
      const session = JSON.parse(
        Buffer.from(payload, "base64url").toString("utf8"),
      );
      if (!Number.isFinite(session.exp) || session.exp < Date.now())
        return null;
      if (session.role === "staff" && session.teamId === null)
        return { role: "staff", teamId: null, sessionVersion: null };
      if (session.role === "view" && session.teamId === null)
        return { role: "view", teamId: null, sessionVersion: null };
      if (
        session.role === "team" &&
        Number.isInteger(session.teamId) &&
        session.teamId >= 1 &&
        session.teamId <= maxTeamCount &&
        Number.isInteger(session.sessionVersion)
      ) {
        const teamSession = db
          .prepare(
            `SELECT ts.session_version
        FROM team_sessions ts INNER JOIN teams t ON t.team_id = ts.team_id
        WHERE ts.team_id = ?`,
          )
          .get(session.teamId);
        if (
          teamSession &&
          teamSession.session_version === session.sessionVersion
        ) {
          if (touch)
            db.prepare(
              "UPDATE team_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE team_id = ?",
            ).run(session.teamId);
          return {
            role: "team",
            teamId: session.teamId,
            sessionVersion: session.sessionVersion,
          };
        }
      }
    } catch {
      return null;
    }
    return null;
  }

  return { authenticate, createSessionToken, publicSession, readSession };
}
