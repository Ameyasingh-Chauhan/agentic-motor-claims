/** Error thrown by `api()`: carries the HTTP status and parsed body so callers can branch on them. */
export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

function messageFrom(body, fallback) {
  const d = body?.detail ?? body?.error;
  if (typeof d === "string") return d;
  return d?.message || fallback;
}

/** fetch wrapper for /api: cookie credentials, JSON in/out, ApiError on non-2xx (network errors stay TypeError). */
export async function api(path, { method = "GET", body, params, signal } = {}) {
  const qs = params ? new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== "")).toString() : "";
  const res = await fetch(`/api${path}${qs ? `?${qs}` : ""}`, {
    method,
    signal,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.headers.get("content-type")?.includes("application/json") ? await res.json().catch(() => null) : null;
  if (!res.ok) throw new ApiError(messageFrom(data, res.statusText || "Request failed"), res.status, data);
  return data;
}

/** Multipart upload to /api (POST /uploads/{claim_id}): `fields` become form fields beside `file`. Same errors as `api()`. */
export async function uploadFile(path, file, fields = {}, { signal } = {}) {
  const form = new FormData();
  form.append("file", file, file.name);
  for (const [k, v] of Object.entries(fields)) if (v != null) form.append(k, v);
  const res = await fetch(`/api${path}`, { method: "POST", body: form, credentials: "include", signal });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(messageFrom(data, res.statusText || "Upload failed"), res.status, data);
  return data;
}
