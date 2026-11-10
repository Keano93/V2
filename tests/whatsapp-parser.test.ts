import { describe, expect, it } from "vitest";
import { looksLikeWhatsApp, parseWhatsApp } from "@/lib/parsers/whatsapp";

const iso = (d: Date) => d.toISOString();

describe("parseWhatsApp – Android export", () => {
  const text = [
    "06/10/2026, 07:42 - Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them. Tap to learn more.",
    "06/10/2026, 07:43 - Tomás Byrne created group \"Kilbrack Site Team\"",
    "06/10/2026, 07:43 - Tomás Byrne added Gerry Nolan",
    "06/10/2026, 07:45 - Tomás Byrne: Morning lads, steel erectors on site at 8",
    "06/10/2026, 08:10 - Gerry Nolan: Still no rev C drawings for the roof steel.",
    "Can't set out the purlins without them.",
    "",
    "Told Aoife yesterday.",
    "06/10/2026, 08:11 - Gerry Nolan: <Media omitted>",
    "06/10/2026, 17:30 - Gerry Nolan left",
  ].join("\n");

  const { messages, warnings } = parseWhatsApp(text);

  it("skips system lines and keeps real messages", () => {
    expect(messages.map((m) => m.sender)).toEqual(["Tomás Byrne", "Gerry Nolan", "Gerry Nolan"]);
    expect(warnings).toEqual([]);
  });

  it("joins multi-line messages, keeping blank lines inside them", () => {
    expect(messages[1].body).toBe(
      "Still no rev C drawings for the roof steel.\nCan't set out the purlins without them.\n\nTold Aoife yesterday.",
    );
  });

  it("reads times as Irish local time (IST = UTC+1 in October)", () => {
    expect(iso(messages[0].sentAt)).toBe("2026-10-06T06:45:00.000Z");
    expect(messages[0].timePrecision).toBe("datetime");
  });

  it("marks media placeholders", () => {
    expect(messages[2].body).toBe("[Media: Media omitted]");
  });
});

describe("parseWhatsApp – iOS export", () => {
  const text = [
    "[28/09/2026, 09:14:22] Lumen M&E – Halcyon: ‎Messages and calls are end-to-end encrypted.",
    "[28/09/2026, 09:15:01] Lumen M&E – Halcyon: ‎Ciara O'Neill added Paddy Fitzgerald",
    "[28/09/2026, 09:16:45] Ciara O'Neill: Paddy can you confirm DH2 containment start?",
    "[28/09/2026, 09:20:03] Paddy Fitzgerald: Not until we get the coordinated drawings: still waiting",
    "[28/09/2026, 09:21:10] Paddy Fitzgerald: ‎image omitted",
  ].join("\n");

  const { messages } = parseWhatsApp(text);

  it("parses bracketed timestamps with seconds", () => {
    expect(messages).toHaveLength(3);
    expect(iso(messages[0].sentAt)).toBe("2026-09-28T08:16:45.000Z");
  });

  it("splits sender on the first colon only", () => {
    expect(messages[1].sender).toBe("Paddy Fitzgerald");
    expect(messages[1].body).toBe("Not until we get the coordinated drawings: still waiting");
  });

  it("strips invisible direction marks from media placeholders", () => {
    expect(messages[2].body).toBe("[Media: image omitted]");
  });
});

describe("parseWhatsApp – date and time variants", () => {
  it("handles 12-hour clocks, 2-digit years and narrow no-break spaces", () => {
    const text = [
      "6/10/26, 9:05 am - Aoife: early one",
      "6/10/26, 12:30 pm - Aoife: lunchtime",
      "6/10/26, 12:05 am - Aoife: just after midnight",
      "6/10/26, 3:15 p.m. - Aoife: afternoon",
    ].join("\n");
    const { messages } = parseWhatsApp(text);
    expect(messages.map((m) => iso(m.sentAt))).toEqual([
      "2026-10-06T08:05:00.000Z",
      "2026-10-06T11:30:00.000Z",
      "2026-10-05T23:05:00.000Z",
      "2026-10-06T14:15:00.000Z",
    ]);
  });

  it("reads ambiguous numeric dates day-first by default (Irish exports)", () => {
    const { messages } = parseWhatsApp("03/04/2026, 10:00 - A: hi\n03/04/2026, 10:01 - B: hello");
    expect(iso(messages[0].sentAt)).toBe("2026-04-03T09:00:00.000Z"); // 3 April
  });

  it("switches to month-first when the file proves it", () => {
    const { messages } = parseWhatsApp("10/13/2026, 10:00 - A: hi\n10/14/2026, 10:01 - B: hello");
    expect(iso(messages[0].sentAt)).toBe("2026-10-13T09:00:00.000Z");
  });

  it("honours an explicit date order", () => {
    const { messages } = parseWhatsApp("03/04/2026, 10:00 - A: hi", { dateOrder: "MDY" });
    expect(iso(messages[0].sentAt)).toBe("2026-03-04T10:00:00.000Z"); // 4 March, GMT
  });

  it("handles the winter clock change (GMT after the last Sunday in October)", () => {
    const { messages } = parseWhatsApp("24/10/2026, 10:00 - A: before\n26/10/2026, 10:00 - A: after");
    expect(iso(messages[0].sentAt)).toBe("2026-10-24T09:00:00.000Z");
    expect(iso(messages[1].sentAt)).toBe("2026-10-26T10:00:00.000Z");
  });

  it("warns about and skips impossible dates", () => {
    const { messages, warnings } = parseWhatsApp("31/02/2026, 10:00 - A: hi\n01/03/2026, 10:00 - A: ok");
    expect(messages).toHaveLength(1);
    expect(warnings[0]).toMatch(/invalid date/);
  });

  it("warns when there is text before the first message", () => {
    const { messages, warnings } = parseWhatsApp("Exported chat\n06/10/2026, 10:00 - A: hi");
    expect(messages).toHaveLength(1);
    expect(warnings[0]).toMatch(/before the first timestamp/);
  });

  it("does not treat ordinary messages as system notices", () => {
    const { messages } = parseWhatsApp(
      "06/10/2026, 10:00 - Gerry: We added two more lads to the crew today\n06/10/2026, 10:05 - Gerry: Paddy left",
    );
    // "Paddy left" after a real sender colon is a normal message, not a system line.
    expect(messages).toHaveLength(2);
  });
});

describe("looksLikeWhatsApp", () => {
  it("recognises exports and rejects emails", () => {
    expect(looksLikeWhatsApp("06/10/2026, 10:00 - A: hi\n06/10/2026, 10:01 - B: yo")).toBe(true);
    expect(looksLikeWhatsApp("From: A\nSent: Tuesday 6 October 2026 10:00\nSubject: x")).toBe(false);
  });
});
