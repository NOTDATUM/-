const TOKEN_KEY = "be_game_session_token";

declare global {
  interface Window {
    __BE_API_URL__?: string;
    __BE_STATIC_MODE__?: boolean;
  }
}

function getApiBase() {
  if (typeof window === "undefined") return "";
  return (window.__BE_API_URL__ ?? "").replace(/\/$/, "");
}

function missingServerResponse() {
  return new Response(
    JSON.stringify({ error: "공용 게임 서버 주소가 설정되지 않았습니다." }),
    {
      status: 503,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}

export function setApiSessionToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearApiSessionToken() {
  if (typeof window !== "undefined") window.localStorage.removeItem(TOKEN_KEY);
}

export function apiFetch(path: string, init: RequestInit = {}) {
  const base = getApiBase();
  if (
    typeof window !== "undefined" &&
    window.__BE_STATIC_MODE__ === false &&
    !base
  ) {
    return Promise.resolve(missingServerResponse());
  }

  const headers = new Headers(init.headers);
  if (base) {
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(`${base}${path}`, {
    ...init,
    headers,
    credentials: base ? "omit" : init.credentials,
  });
}
