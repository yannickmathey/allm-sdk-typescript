export class ALLMError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly requestId?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ALLMError";
  }

  static fromResponse(response: Response, payload: unknown): ALLMError {
    const problem = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
    const message = typeof problem.detail === "string"
      ? problem.detail
      : typeof problem.title === "string"
        ? problem.title
        : `ALLM request failed with status ${response.status}`;
    return new ALLMError(
      message,
      response.status,
      typeof problem.code === "string" ? problem.code : "API_ERROR",
      response.headers.get("x-request-id") ?? undefined,
      payload,
    );
  }
}
