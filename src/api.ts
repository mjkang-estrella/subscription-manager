export async function api<T = any>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      signal: options.signal ?? AbortSignal.timeout(90000),
      headers: { "Content-Type": "application/json", ...options.headers },
    });
  } catch (error) {
    if (
      error instanceof DOMException &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    )
      throw new Error(
        "The request timed out or was cancelled. Try again when you’re ready.",
      );
    throw new Error(
      "Could not reach Folio. Check your connection and try again.",
    );
  }
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new Error(
      "The server returned an unexpected response. Reload the page and try again.",
    );
  const body = await response.json();
  if (!response.ok)
    throw new Error(
      body.error ||
        `The request failed (${response.status}). Please try again.`,
    );
  return body as T;
}
export const post = <T = any>(
  url: string,
  body: unknown = {},
  options: RequestInit = {},
) => api<T>(url, { ...options, method: "POST", body: JSON.stringify(body) });
