import type { MarketEvent, ScanReport } from "@pulse/shared";
import { config } from "./config.js";
import type { EvidenceItem } from "./evidence.js";
import type { PriceSwing } from "./markets.js";

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
  const res = await fetch(`${config.openaiBaseUrl}/chat/completions`, {
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
  if (!res.ok) throw new Error(`llm ${res.status}`);
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
      console.warn("[llm] fallback:", err instanceof Error ? err.message : err);
    }
  }
  return ruleBased(event);
}

function moveLine(event: MarketEvent, swing: PriceSwing) {
  const dir = swing.deltaYes >= 0 ? "上涨" : "下跌";
  const pts = `${swing.deltaYes >= 0 ? "+" : ""}${(swing.deltaYes * 100).toFixed(1)}pt`;
  const vol = `${swing.volumeRatio >= 0 ? "+" : ""}${(swing.volumeRatio * 100).toFixed(0)}%`;
  return `「${event.title}」YES ${pct(swing.prevYes)} → ${pct(event.yesPrice)}（${dir} ${pts}），成交量 ${vol}。`;
}

function cite(items: EvidenceItem[]) {
  return items
    .slice(0, 5)
    .map((item) => `${item.kind === "news" ? "新闻" : item.kind === "social" ? "社交" : "资金"} · ${item.source}：${item.title}`)
    .join("；");
}

export function explainFromEvidence(event: MarketEvent, swing: PriceSwing, evidence: EvidenceItem[]) {
  const head = moveLine(event, swing);
  const news = evidence.filter((e) => e.kind === "news");
  const social = evidence.filter((e) => e.kind === "social");
  const flow = evidence.filter((e) => e.kind === "flow");
  const dir = swing.deltaYes >= 0 ? "涨" : "跌";
  if (news[0] || social[0]) {
    const lead = news[0] || social[0];
    return `${head}之所以${dir}，是因为公开信息出现：${lead.title}。${cite(evidence)}`;
  }
  if (flow[0]) {
    return `${head}公开新闻和社交没有对应头条，${dir}更像是盘口资金在动：${flow[0].title}。`;
  }
  return `${head}公开新闻、社交和近期成交都没有抓到对应线索，这次${dir}更像是薄书上的盘内波动，而不是新消息定价。`;
}

async function chatJson(system: string, user: string) {
  const res = await fetch(`${config.openaiBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.openaiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: config.openaiModel,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`llm ${res.status}`);
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return JSON.parse(body.choices?.[0]?.message?.content ?? "{}") as {
    why?: string;
  };
}

export async function explainSwing(event: MarketEvent, swing: PriceSwing, evidence: EvidenceItem[]) {
  const fallback = explainFromEvidence(event, swing, evidence);
  if (!config.openaiKey) return fallback;
  try {
    const parsed = await chatJson(
      "你是 Pulse，预测市场盯盘分析员。必须用中文回答这次 YES 概率为什么涨或为什么跌。只根据提供的新闻、社交和成交证据，禁止编造未出现的头条。返回 JSON {why: string}，2～4 句，先说涨跌，再给原因，并点名依据。",
      JSON.stringify({
        title: event.title,
        question: event.question,
        from: swing.prevYes,
        to: event.yesPrice,
        deltaYes: swing.deltaYes,
        volumeRatio: swing.volumeRatio,
        evidence,
      }),
    );
    const why = parsed.why?.trim();
    if (!why) return fallback;
    return why.includes(pct(event.yesPrice)) || why.includes("YES") ? why : `${moveLine(event, swing)}${why}`;
  } catch (err) {
    console.warn("[llm] explain fallback:", err instanceof Error ? err.message : err);
    return fallback;
  }
}
