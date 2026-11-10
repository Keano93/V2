import { describe, expect, it } from "vitest";
import { parseEml, parsePastedEmails } from "@/lib/parsers/email";
import { parseDiary } from "@/lib/parsers/diary";
import { parseLooseDate } from "@/lib/time";

describe("parseLooseDate", () => {
  it.each([
    ["Tuesday, 6 October 2026 10:12", "2026-10-06T09:12:00.000Z", "datetime"],
    ["Tue 6th Oct 2026 at 2:05 pm", "2026-10-06T13:05:00.000Z", "datetime"],
    ["06/10/2026 10:12", "2026-10-06T09:12:00.000Z", "datetime"],
    ["06/10/2026", "2026-10-06T11:00:00.000Z", "date"],
    ["October 6, 2026", "2026-10-06T11:00:00.000Z", "date"],
    ["Tue, 6 Oct 2026 10:12:00 +0000", "2026-10-06T10:12:00.000Z", "datetime"],
  ])("%s", (input, expected, precision) => {
    const r = parseLooseDate(input);
    expect(r?.date.toISOString()).toBe(expected);
    expect(r?.precision).toBe(precision);
  });

  it("rejects sentences that merely contain a date", () => {
    expect(parseLooseDate("Drawings due on 06/10/2026 per programme")).toBeNull();
  });
});

describe("parsePastedEmails", () => {
  const text = `From: Declan Murphy <declan@brennandoyle.example>
Sent: Wednesday, 7 October 2026 16:02
To: Aoife Kinsella <aoife@kinsellahart.example>
Subject: RE: RFI-014 Roof steel connection details

Aoife, the steel erector was stood down again today.

-----Original Message-----
From: Aoife Kinsella <aoife@kinsellahart.example>
Sent: Monday, 5 October 2026 11:30
To: Declan Murphy
Subject: RFI-014 Roof steel connection details

Engineer is still reviewing. Expect rev C by end of week.`;

  it("splits a reply chain into separate messages", () => {
    const { messages, warnings } = parsePastedEmails(text);
    expect(warnings).toEqual([]);
    expect(messages).toHaveLength(2);
    expect(messages[0].sender).toBe("Declan Murphy");
    expect(messages[0].subject).toBe("RE: RFI-014 Roof steel connection details");
    expect(messages[0].body).toBe("Aoife, the steel erector was stood down again today.");
    expect(messages[1].sender).toBe("Aoife Kinsella");
    expect(messages[1].sentAt.toISOString()).toBe("2026-10-05T10:30:00.000Z");
  });

  it("handles Gmail-style 'On ... wrote:' quotes", () => {
    const { messages } = parsePastedEmails(`From: A <a@x.example>
Date: 8 Oct 2026 09:00
Subject: Re: access

Noted.

On Tue, 6 Oct 2026 at 14:10, Rob Hennessy <rob@corrib.example> wrote:
> Data Hall 1 handover moved to the 19th.`);
    expect(messages).toHaveLength(2);
    expect(messages[1].sender).toBe("Rob Hennessy");
    expect(messages[1].body).toBe("Data Hall 1 handover moved to the 19th.");
  });
});

describe("parseEml", () => {
  it("uses real headers for the top message", async () => {
    const eml = [
      "From: Niamh Clarke <niamh@corrib.example>",
      "To: Ciara O'Neill <ciara@lumen.example>",
      "Subject: Electrical spec rev 04",
      "Date: Thu, 15 Oct 2026 08:45:00 +0100",
      "Message-ID: <abc@corrib.example>",
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Please find rev 04 attached. UPS units changed.",
    ].join("\r\n");
    const { messages } = await parseEml(eml);
    expect(messages).toHaveLength(1);
    expect(messages[0].sender).toBe("Niamh Clarke");
    expect(messages[0].sentAt.toISOString()).toBe("2026-10-15T07:45:00.000Z");
    expect(messages[0].body).toBe("Please find rev 04 attached. UPS units changed.");
  });
});

describe("parseDiary", () => {
  const diary = `KILBRACK NS EXTENSION – SITE DIARY
Prepared by: Tomás Byrne
Project: Kilbrack NS

Date: Monday 5 October 2026
Weather: dry
- 6 operatives on site. Blockwork to gridline C.
- Excavation for SEN room base hit old foundation.
  Engineer to advise.

Date: 06/10/2026
Steel erectors stood down at 11:00.`;

  it("splits by date heading and bullet, carrying the author", () => {
    const { messages, warnings } = parseDiary(diary, { kind: "diary" });
    expect(warnings).toEqual([]);
    expect(messages.map((m) => m.body)).toEqual([
      "Weather: dry",
      "6 operatives on site. Blockwork to gridline C.",
      "Excavation for SEN room base hit old foundation.\nEngineer to advise.",
      "Steel erectors stood down at 11:00.",
    ]);
    expect(messages[0].sender).toBe("Tomás Byrne");
    expect(messages[0].timePrecision).toBe("date");
    expect(messages[3].sentAt.toISOString()).toBe("2026-10-06T11:00:00.000Z");
  });

  it("warns when there are no dates", () => {
    const { messages, warnings } = parseDiary("Just some notes\nwith no dates", { kind: "diary" });
    expect(messages).toHaveLength(0);
    expect(warnings[0]).toMatch(/No dated entries/);
  });
});
