"use client";

import { useActionState } from "react";
import { runDetectionAction, type DetectState } from "@/app/actions";
import { buttonClass } from "@/components/ui";

export function DetectForm({ projectId, aiAvailable }: { projectId: string; aiAvailable: boolean }) {
  const [state, action, pending] = useActionState<DetectState, FormData>(runDetectionAction, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="projectId" value={projectId} />
      <div className="flex flex-wrap items-center gap-2">
        <button name="detector" value="ai" className={buttonClass} disabled={pending || !aiAvailable}>
          {pending ? "Running…" : "Run AI detection"}
        </button>
        <button
          name="detector"
          value="baseline"
          disabled={pending}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
        >
          Run keyword baseline (no AI)
        </button>
        {!aiAvailable && (
          <span className="text-xs text-slate-500">
            Add ANTHROPIC_API_KEY to .env and restart to enable AI detection (cached results still work via the CLI).
          </span>
        )}
      </div>
      {state.message && <p className="text-sm text-emerald-700">{state.message}</p>}
      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
    </form>
  );
}
