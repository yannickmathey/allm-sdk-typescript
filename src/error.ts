export class ALLMError extends Error {
  constructor(message: string, readonly status: number, readonly code: string, readonly requestId?: string, readonly details?: unknown) { super(message); this.name = "ALLMError"; }
  static fromResponse(response: Response, payload: unknown) {
    const problem = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
    return new ALLMError(typeof problem.detail === "string" ? problem.detail : `ALLM request failed with status ${response.status}`, response.status, typeof problem.code === "string" ? problem.code : "API_ERROR", response.headers.get("x-request-id") ?? undefined, payload);
  }
}
