"use client";

import { useActionState, useRef } from "react";
import { ingestAction, type IngestState } from "@/app/actions";
import { buttonClass, inputClass } from "@/components/ui";

export function IngestForm({ projectId }: { projectId: string }) {
  const [state, action, pending] = useActionState<IngestState, FormData>(ingestAction, { results: [] });
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        await action(fd);
        formRef.current?.reset();
      }}
      className="space-y-3"
    >
      <input type="hidden" name="projectId" value={projectId} />
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block text-slate-600">Files (.txt WhatsApp export, .eml, .pdf, .txt)</span>
          <input type="file" name="files" multiple accept=".txt,.eml,.pdf,.text" className="text-sm" />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Type</span>
            <select name="kind" className={inputClass} defaultValue="auto">
              <option value="auto">Auto-detect</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Email</option>
              <option value="diary">Site diary</option>
              <option value="minutes">Minutes</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Dates</span>
            <select name="dateOrder" className={inputClass} defaultValue="DMY">
              <option value="DMY">DD/MM</option>
              <option value="MDY">MM/DD</option>
            </select>
          </label>
        </div>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block text-slate-600">…or paste text (emails with From/Sent headers, chat, diary)</span>
        <textarea name="pasted" rows={5} className={`${inputClass} font-mono text-xs`} />
      </label>
      <button className={buttonClass} disabled={pending}>
        {pending ? "Importing…" : "Import"}
      </button>

      {state.results.length > 0 && (
        <ul className="space-y-2 text-sm">
          {state.results.map((r, i) => (
            <li
              key={i}
              className={`rounded border p-2 ${r.error ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50"}`}
            >
              <span className="font-medium">{r.label}</span>{" "}
              {r.error ? (
                <span className="text-red-700">: {r.error}</span>
              ) : (
                <span className="text-slate-700">
                  : read as {r.kind}, {r.parsed} messages found, {r.created} added
                  {r.duplicates > 0 && `, ${r.duplicates} duplicates skipped`}
                </span>
              )}
              {r.warnings.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-xs text-amber-800">
                  {r.warnings.map((w, j) => (
                    <li key={j}>{w}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
