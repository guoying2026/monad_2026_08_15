import type { MarketEvent, ScanReport } from "@pulse/shared";
import { config } from "./config.js";

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

function usd(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

function ruleBased(event: MarketEvent): Pick<ScanReport, "headline" | "thesis" | "risks" | "signals" | "model"> {
  const lead = [...(event.outcomes ?? [])].sort((a, b) => b.yesPrice - a.yesPrice)[0];
  const leanLabel = lead?.label || "YES";
  const lean = event.yesPrice >= 0.55 ? leanLabel : event.yesPrice <= 0.45 ? "NO CLEAR LEADER" : "NO CLEAR EDGE";
  const volumeNote =
    event.volume > 2_000_000 ? "deep book, crowd is committed" : event.volume > 200_000 ? "usable liquidity" : "thin book — prints can whip";
  const board =
    event.outcomes && event.outcomes.length > 1
      ? event.outcomes
          .slice()
          .sort((a, b) => b.yesPrice - a.yesPrice)
          .map((o) => `${o.label} ${pct(o.yesPrice)}`)
          .join("; ")
      : `Implied YES is ${pct(event.yesPrice)} (NO ${pct(event.noPrice)}).`;

  return {
    model: "pulse-rules/v1",
    headline: `${lean} · ${pct(event.yesPrice)} on “${event.title}”`,
    thesis:
      `${board} Volume ${usd(event.volume)}, liquidity ${usd(event.liquidity)}. ${volumeNote}. ` +
      (event.yesPrice < 0.55
        ? "No single outcome is crowding the book — wait for a 5–8pt move before treating a print as confirmation."
        : `Crowd is leaning “${leanLabel}”. Treat this as a watch level, not a bet.`),
    risks: [
      "Prediction-market prices embed fees, bots, and stale limit orders — not a poll.",
      event.volume < 200_000 ? "Low volume: a single wallet can move the print you are watching." : "A headline can gap the implied probability before the book catches up.",
      "This is a watch report, not financial advice.",
    ],
    signals: [
      ...(event.outcomes && event.outcomes.length > 1
        ? event.outcomes
            .slice()
            .sort((a, b) => b.yesPrice - a.yesPrice)
            .slice(0, 5)
            .map((o) => ({ label: o.label, value: pct(o.yesPrice) }))
        : [
            { label: "YES", value: pct(event.yesPrice) },
            { label: "NO", value: pct(event.noPrice) },
          ]),
      { label: "Volume", value: usd(event.volume) },
      { label: "Liquidity", value: usd(event.liquidity) },
    ],
  };
}

async function fromOpenAI(event: MarketEvent) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.openaiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: config.openaiModel,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are Pulse, a terse prediction-market analyst. Return JSON {headline, thesis, risks: string[3], lean: YES|NO|UNCLEAR}. No investment advice. Cite the numbers given.",
        },
        {
          role: "user",
          content: JSON.stringify({
            title: event.title,
            question: event.question,
            yesPrice: event.yesPrice,
            noPrice: event.noPrice,
            volume: event.volume,
            liquidity: event.liquidity,
            endDate: event.endDate,
          }),
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`openai ${res.status}`);
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const parsed = JSON.parse(body.choices?.[0]?.message?.content ?? "{}") as {
    headline?: string;
    thesis?: string;
    risks?: string[];
    lean?: string;
  };
  const fallback = ruleBased(event);
  return {
    model: config.openaiModel,
    headline: parsed.headline || fallback.headline,
    thesis: parsed.thesis || fallback.thesis,
    risks: parsed.risks?.length ? parsed.risks.slice(0, 4) : fallback.risks,
    signals: [
      ...fallback.signals.filter((s) => s.label !== "Lean"),
      { label: "Lean", value: parsed.lean || fallback.signals.find((s) => s.label === "Lean")?.value || "—" },
    ],
  };
}

export async function analyzeEvent(event: MarketEvent) {
  if (config.openaiKey) {
    try {
      return await fromOpenAI(event);
    } catch (err) {
      console.warn("[llm] openai fallback:", err instanceof Error ? err.message : err);
    }
  }
  return ruleBased(event);
}

export function alertReason(
  event: MarketEvent,
  swing: { kind: "price" | "volume" | "both"; prevYes: number; deltaYes: number; volumeRatio: number },
) {
  const dir = swing.deltaYes >= 0 ? "up" : "down";
  const pts = `${swing.deltaYes >= 0 ? "+" : ""}${(swing.deltaYes * 100).toFixed(1)}pt`;
  const vol = swing.volumeRatio >= 0 ? `volume +${(swing.volumeRatio * 100).toFixed(0)}%` : `volume ${(swing.volumeRatio * 100).toFixed(0)}%`;
  if (swing.kind === "volume") {
    return `Pulse flagged a flow spike on “${event.title}”: ${vol} while YES moved ${pts} to ${pct(event.yesPrice)}. This is a liquidity print, not a direction call.`;
  }
  return `Pulse caught a YES swing ${dir} ${pts} on “${event.title}” (${pct(swing.prevYes)} → ${pct(event.yesPrice)}). ${vol}. NO now ${pct(event.noPrice)}. Agent-detected move — check whether the tape has news behind it.`;
}
