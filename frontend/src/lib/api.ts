import { API_KEY, API_URL } from "./config";

export class ApiError extends Error {
  status: number;
  retryAfter: string | null;

  constructor(message: string, status: number, retryAfter: string | null = null) {
    super(message);
    this.status = status;          // 0 means "no connection"
    this.retryAfter = retryAfter;  // seconds, only for 429
  }
}

interface ApiOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  body?: unknown;
  idempotencyKey?: string;
}

// It makes your API requests reusable and dynamic so you do not have to repeat yourself across your entire React application. eg const slots = await api("/slots");
// const booking = await api("/bookings", { method: "POST", body: data });
export async function api<T = any>(path: string, { method = "GET", body, idempotencyKey }: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = { "X-API-Key": API_KEY };
  if (body) headers["Content-Type"] = "application/json";
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Cannot reach the server. Check your connection.", 0);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(
      data.error || "Something went wrong.",
      response.status,
      response.headers.get("Retry-After")
    );
  }
  return data as T;
}

/**
 * Makes a short message for the user
 */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 429) {
      return `Too many attempts. Please wait ${err.retryAfter || "a few"} seconds.`;
    }
    return err.message;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return "An unexpected error occurred.";
}