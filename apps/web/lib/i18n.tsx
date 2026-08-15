"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Locale = "zh" | "en";

const dict = {
  zh: {
    navAgent: "身份",
    navScan: "付费盯盘",
    navAlerts: "结果",
    connect: "连接钱包",
    connecting: "连接中…",
    switchNetwork: "切换到 Monad 测试网",
    homeKicker: "ERC-8004 · x402 · {network}",
    homeTitle: "一个盘只跑一次。上车一律一分钱。",
    homeLead:
      "Polymarket 事件是固定的。Pulse 对每个盘只计算一次波动，推给 1 人和推给 100 人成本几乎一样。每个事件订阅一律 $0.01 USDC，人多是热度，不是折扣。",
    homeCtaScan: "付 $0.01 开始盯盘",
    homeCtaScan8004: "在 8004scan 打开",
    cardIdentity: "身份",
    cardIdentityBody: "ERC-721 Agent Card。可被发现、可转让，指向 HTTP 接口和收款钱包。",
    cardPayment: "付款",
    cardPaymentBody: "盯一个 Polymarket 事件 $0.01。个人报告免费。x402 在 Monad 收 USDC，一口价。",
    cardWatch: "盯盘",
    cardWatchBody: "每个事件只跑一次，再按人数扇出。人多说明这个盘热，价格不变。",
    onchainCard: "链上名片",
    labelAgent: "Agent",
    agentPending: "（尚未铸造）",
    labelRegistry: "Identity Registry",
    labelPayTo: "收款地址",
    setPayTo: "请设置 PAY_TO_ADDRESS",
    labelX402: "x402",
    demoMode: "演示模式（SKIP_X402）",
    scanKicker: "第 2 屏",
    scanTitle: "选一个盘，付一分钱。",
    scanSkip:
      "支付门已关闭（SKIP_X402）。评委看到的是同一套接口，打开 USDC 后才会真正扣款。",
    scanPaid: "{price} USDC，经 x402 在 {network} 结算。",
    searchLabel: "想盯哪个市场",
    searchPlaceholder: "关键词，或粘贴 Polymarket 链接",
    searchHint: "贴链接会马上搜，回车或点右侧按钮也可以。选中的盘会出现在右边结算。",
    searchButton: "搜索",
    searching: "搜索中…",
    selectedMarket: "当前选中",
    outcomes: "{n} 个结果",
    noResults: "没有找到。换个词，或贴完整的 polymarket.com/event/… 链接。",
    trending: "热门市场",
    checkout: "结算",
    watchHint: "不用设阈值。Pulse 自己发现概率波动再推送。每个事件订阅一律 $0.01，同一份计算推给所有订阅者。",
    poolPrice: "订阅价",
    poolMembers: "已盯这个盘",
    poolJoined: "{n} 人",
    notifyVia: "推送到",
    channelEmail: "邮箱",
    channelTelegram: "Telegram",
    emailLabel: "邮箱",
    emailPlaceholder: "you@email.com",
    telegram: "Telegram chatId",
    telegramHint: "先私聊 Bot，再填你的 chatId",
    notifyNone: "不填渠道的话，提醒只出现在结果页。",
    optional: "选填，不填只记在结果页",
    viewHistory: "查看历史通知",
    connectThenWatch: "先连接钱包，再付 $0.01 盯盘",
    opening: "加入中…",
    payAlert: "付 $0.01 盯这个盘",
    errEmail: "请填写有效邮箱，或关掉邮箱渠道。",
    errAlready: "你已经盯过这个事件了。",
    errConnectMonad: "请先连接 Monad 钱包",
    errConnect: "请先连接钱包",
    errCancelled: "已取消签名。",
    errFunds: "测试网 USDC 不足。请到 faucet.circle.com 领取 Monad Testnet USDC。",
    alertsKicker: "第 3 屏",
    alertsTitle: "报告与通知记录",
    useful: "有用",
    inaccurate: "不准",
    noReport: "还没有报告。盯盘触发后会出现在这里。",
    alertHistory: "通知历史",
    watchingTitle: "正在盯的盘",
    watchingEmpty: "还没有订阅。先到「付费盯盘」选一个事件。",
    watchingChannel: "渠道",
    watchingNone: "仅结果页",
    checkSwing: "检查波动",
    checkingSwing: "检查中…",
    checkSwingDone: "本轮检查了 {events} 个盘，触发 {fired} 条。",
    noAlerts: "还没有波动提醒。点「检查波动」，或等 Worker 自动跑。",
    telegramSent: "已发 Telegram",
    emailSent: "已发邮件",
    bothSent: "已发 Telegram · 邮件",
    loggedOnly: "仅记日志",
    payment: "付款",
    loading: "加载中…",
    feedbackNoId: "尚未写入 AGENT_ID，评价先记在本地。铸好 NFT 后再上链。",
    feedbackTx: "评价交易 {hash}",
    feedbackFail: "评价失败",
  },
  en: {
    navAgent: "Agent",
    navScan: "Pay & watch",
    navAlerts: "Results",
    connect: "Connect",
    connecting: "…",
    switchNetwork: "Switch to Monad Testnet",
    homeKicker: "ERC-8004 · x402 · {network}",
    homeTitle: "One event. One compute. Always a cent.",
    homeLead:
      "Polymarket events are fixed. Pulse analyzes each market once — pinging 1 wallet or 100 costs almost the same. Every event watch is $0.01 USDC. A crowd means heat, not a discount.",
    homeCtaScan: "Pay $0.01 and watch",
    homeCtaScan8004: "Open on 8004scan",
    cardIdentity: "Identity",
    cardIdentityBody: "ERC-721 agent card. Discoverable, transferable, points at HTTP + wallet.",
    cardPayment: "Payment",
    cardPaymentBody: "Watch one Polymarket event for $0.01. Personal report is free. x402 USDC on Monad.",
    cardWatch: "Watch",
    cardWatchBody: "One compute per event, then fan-out. More people means the market is hot. The price does not move.",
    onchainCard: "On-chain card",
    labelAgent: "Agent",
    agentPending: "(not minted yet)",
    labelRegistry: "Identity Registry",
    labelPayTo: "Pay to",
    setPayTo: "set PAY_TO_ADDRESS",
    labelX402: "x402",
    demoMode: "demo mode (SKIP_X402)",
    scanKicker: "Screen 2",
    scanTitle: "Pick a market. Pay a cent.",
    scanSkip: "Payment gate is off (SKIP_X402). Same handlers judges will see with USDC on.",
    scanPaid: "{price} USDC on {network} via x402.",
    searchLabel: "Market to watch",
    searchPlaceholder: "Keyword, or paste a Polymarket URL",
    searchHint: "Paste a link to search immediately. Enter or the icon also works. The selected market shows up in checkout.",
    searchButton: "Search",
    searching: "Searching…",
    selectedMarket: "Selected",
    outcomes: "{n} outcomes",
    noResults: "Nothing found. Try another phrase, or paste a polymarket.com/event/… link.",
    trending: "Trending",
    checkout: "Checkout",
    watchHint: "No threshold. Pulse finds probability swings itself. Every event watch is $0.01. One compute, every subscriber gets the push.",
    poolPrice: "Price",
    poolMembers: "Watching this market",
    poolJoined: "{n} watching",
    notifyVia: "Notify via",
    channelEmail: "Email",
    channelTelegram: "Telegram",
    emailLabel: "Email",
    emailPlaceholder: "you@email.com",
    telegram: "Telegram chatId",
    telegramHint: "Message the bot first, then paste your chatId",
    notifyNone: "Skip both and the alert only shows on Results.",
    optional: "optional — skip to log on Results only",
    viewHistory: "View notification history",
    connectThenWatch: "Connect, then pay $0.01 to watch",
    opening: "Joining…",
    payAlert: "Pay $0.01 to watch",
    errEmail: "Enter a valid email, or turn the email channel off.",
    errAlready: "You already watch this event.",
    errConnectMonad: "Connect a Monad wallet first",
    errConnect: "Connect a wallet first",
    errCancelled: "Signature cancelled.",
    errFunds: "Not enough testnet USDC. Use faucet.circle.com (Monad Testnet).",
    alertsKicker: "Screen 3",
    alertsTitle: "Report & alert tape",
    useful: "Useful",
    inaccurate: "Inaccurate",
    noReport: "No report yet. Alerts show up here after a watch fires.",
    alertHistory: "Notification history",
    watchingTitle: "Watching",
    watchingEmpty: "No subscriptions yet. Pick a market on Pay & watch.",
    watchingChannel: "Channel",
    watchingNone: "Results only",
    checkSwing: "Check for a swing",
    checkingSwing: "Checking…",
    checkSwingDone: "Checked {events} markets, fired {fired}.",
    noAlerts: "No swing yet. Hit “Check for a swing”, or wait for the worker.",
    telegramSent: "telegram sent",
    emailSent: "email sent",
    bothSent: "telegram · email",
    loggedOnly: "logged only",
    payment: "payment",
    loading: "Loading…",
    feedbackNoId: "AGENT_ID not set — UI recorded locally. Wire the registry tx when the NFT is minted.",
    feedbackTx: "Feedback tx {hash}",
    feedbackFail: "feedback failed",
  },
} as const;

export type MessageKey = keyof typeof dict.zh;

type I18n = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, vars?: Record<string, string>) => string;
};

const I18nContext = createContext<I18n | null>(null);

function interpolate(template: string, vars?: Record<string, string>) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "");
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("zh");

  useEffect(() => {
    const saved = window.localStorage.getItem("pulse:locale");
    if (saved === "en" || saved === "zh") setLocaleState(saved);
  }, []);

  const setLocale = (next: Locale) => {
    setLocaleState(next);
    window.localStorage.setItem("pulse:locale", next);
    document.documentElement.lang = next === "zh" ? "zh-CN" : "en";
  };

  const value = useMemo<I18n>(
    () => ({
      locale,
      setLocale,
      t: (key, vars) => interpolate(dict[locale][key], vars),
    }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
