import type { MarketEvent, ScanReport } from "@pulse/shared";
import { config } from "./config.js";
import type { EvidenceItem } from "./evidence.js";
import { pulseLog } from "./log.js";
import type { MoveStory } from "./horizon.js";
import { storyLine } from "./horizon.js";
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

export function explainFromEvidence(event: MarketEvent, swing: PriceSwing, evidence: EvidenceItem[], story?: MoveStory | null) {
  const head = story ? `「${event.title}」${storyLine(story)}。` : moveLine(event, swing);
  const news = evidence.filter((e) => e.kind === "news");
  const social = evidence.filter((e) => e.kind === "social");
  const flow = evidence.filter((e) => e.kind === "flow");
  const dir = (story?.delta ?? swing.deltaYes) >= 0 ? "涨" : "跌";
  if (news[0] || social[0]) {
    const lead = news[0] || social[0];
    return `${head}之所以${dir}，是因为这段时间的公开信息出现：${lead.title}。${cite(evidence)}`;
  }
  if (flow[0]) {
    return `${head}公开新闻和社交没有对应头条，${dir}更像是盘口资金在动：${flow[0].title}。`;
  }
  return `${head}公开新闻、社交没有抓到对应头条。${story?.trend === "steady_down" || story?.trend === "steady_up" ? `形态是${story.trendLabel}，更像这段时间里的持续定价，而不是单次突发消息。` : "更像是盘内波动。"}`;
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

export async function explainSwing(
  event: MarketEvent,
  swing: PriceSwing,
  evidence: EvidenceItem[],
  mode: "initial" | "swing" = "swing",
  story?: MoveStory | null,
) {
  const fallback = explainFromEvidence(event, swing, evidence, story);
  if (!config.openaiKey) {
    pulseLog(event.title, "没有 LLM Key，用规则拼原因");
    return fallback;
  }
  const system =
    mode === "initial"
      ? "你是 Pulse，预测市场盯盘分析员。这是用户刚盯上的盘。用中文说明当前 YES 概率处在什么位置、更长周期（1天/7天/30天）怎么走、新闻/社交/资金在说什么。必须回答现在为什么是这个价。只根据证据，禁止编造头条。返回 JSON {why: string}，2～4 句。"
      : "你是 Pulse，预测市场盯盘分析员。必须用中文回答指定时间窗口里 YES 为什么涨或跌。5分钟的小波动不是重点，要解释主窗口（可能是1小时、1天或1个月）以及形态（匀速/加速/跳变）。只根据证据，禁止编造头条。返回 JSON {why: string}，2～4 句，先说窗口和涨跌，再给原因。";
  pulseLog(event.title, `调用 ${config.openaiModel} 写原因（${mode === "initial" ? "首次开盘" : story?.label ?? "波动"}）`);
  try {
    const parsed = await chatJson(
      system,
      JSON.stringify({
        title: event.title,
        question: event.question,
        story,
        from: story?.from ?? swing.prevYes,
        to: event.yesPrice,
        deltaYes: story?.delta ?? swing.deltaYes,
        volumeRatio: swing.volumeRatio,
        evidence,
      }),
    );
    const why = parsed.why?.trim();
    if (!why) {
      pulseLog(event.title, "模型没写出原因，改用规则");
      return fallback;
    }
    pulseLog(event.title, `原因已生成：${why.slice(0, 80)}${why.length > 80 ? "…" : ""}`);
    return why.includes(pct(event.yesPrice)) || why.includes("YES") ? why : `${moveLine(event, swing)}${why}`;
  } catch (err) {
    pulseLog(event.title, `模型失败，改用规则：${err instanceof Error ? err.message : err}`);
    return fallback;
  }
}
