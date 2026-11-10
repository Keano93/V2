import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function ok(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(status: number, message: string, details?: unknown) {
  return NextResponse.json({ error: { message, details } }, { status });
}

/** Wrap a route handler so validation and unexpected errors come back as JSON, never HTML. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof ZodError) return fail(400, "Invalid input", err.issues);
      console.error(err);
      return fail(500, (err as Error).message ?? "Internal error");
    }
  };
}
