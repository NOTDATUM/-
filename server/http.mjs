export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function createHttpHelpers(allowedOrigins) {
  function corsOrigin(request) {
    const origin = request.headers.origin?.replace(/\/$/, "");
    if (!origin) return null;
    if (!allowedOrigins.has(origin)) {
      throw new HttpError(403, "허용되지 않은 사이트에서 보낸 요청입니다.");
    }
    return origin;
  }

  function setCommonHeaders(response, origin) {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    if (origin) {
      response.setHeader("Access-Control-Allow-Origin", origin);
      response.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, DELETE, OPTIONS",
      );
      response.setHeader(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type",
      );
      response.setHeader("Access-Control-Max-Age", "86400");
      response.setHeader("Vary", "Origin");
    }
  }

  function sendJson(response, status, value, origin = null) {
    setCommonHeaders(response, origin);
    response.statusCode = status;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(JSON.stringify(value));
  }

  async function readJson(request) {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 100_000) {
        throw new HttpError(413, "요청 내용이 너무 큽니다.");
      }
      chunks.push(chunk);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    } catch {
      throw new HttpError(400, "요청 형식이 올바르지 않습니다.");
    }
  }

  return { corsOrigin, setCommonHeaders, sendJson, readJson };
}
