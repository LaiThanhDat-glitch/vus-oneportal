const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

type RequestOptions = Omit<RequestInit, "headers"> & {
  headers?: Record<string, string>;
  auth?: boolean;
};

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { auth = true, headers = {}, ...init } = options;
  const token = typeof window === "undefined" ? null : window.localStorage.getItem("vus_token");
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  if (!response.ok) {
    let message = "Request failed";
    try {
      const error = await response.json();
      message = typeof error.detail === "string" ? error.detail : message;
    } catch {
      // Keep the generic message when the API response is not JSON.
    }
    const failure = new Error(message) as Error & { status?: number };
    failure.status = response.status;
    throw failure;
  }
  return response.json() as Promise<T>;
}

export type PortalUser = {
  id: string;
  email: string;
  full_name: string;
  role: "student" | "teacher" | "staff";
};
