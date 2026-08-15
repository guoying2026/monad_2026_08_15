"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Locale = "zh" | "en";

const dict = {
  zh: {
    navAgent: "身份",
    navScan: "付费盯盘",
    navAlerts: "结果",
    navPayments: "付款",
    connect: "连接钱包",
    connecting: "连接中…",
    switchNetwork: "切换到 Monad 测试网",
    homeKicker: "ERC-8004 · x402 · {network}",
    homeTitle: "盯一个盘一分钱。波动来了，告诉你为什么。",
    homeLead:
      "选一个 Polymarket 事件，付 $0.01 USDC。订阅后立刻扫一轮，之后每 5 分钟看过去 5 分钟的 YES 变动，对照新闻、社交和盘口资金，用邮件或 Telegram 推到你留下的地址。",
    homeCtaScan: "付 $0.01 开始盯盘",
    cardIdentity: "身份",
    cardIdentityBody: "链上 ERC-721 Agent。可被发现、可转让，指向 HTTP 接口和收款钱包。",
    cardPayment: "付款",
    cardPaymentBody: "盯一个事件 $0.01，经 x402 在 Monad 收 USDC。邮箱和 Telegram 都能填，通知只发给这条订阅里的人。",
    cardWatch: "盯盘",
    cardWatchBody: "订阅后立刻扫一轮。之后每 5 分钟看 YES 变动，查出新闻、社交和资金，写明为什么涨或为什么跌。",
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
    watchHint: "不用设阈值。Pulse 发现波动后会查新闻、社交和盘口资金，并写明为什么涨或为什么跌。每个事件订阅一律 $0.01。",
    poolPrice: "订阅价",
    poolMembers: "已盯这个盘",
    poolJoined: "{n} 人",
    notifyTip: "填邮箱或 Telegram，也可以两个都填。每个订阅只通知这一行里填的地址。",
    emailLabel: "邮箱",
    emailPlaceholder: "you@email.com",
    emailHint: "演示阶段用 Resend 测试发件人，只能发到你注册 Resend 时用的那个邮箱；填了别的地址系统会尝试发送，但可能被拒。",
    telegram: "Telegram chatId",
    telegramPlaceholder: "只填数字，例如 7898960928",
    telegramHow: "怎么拿到 chatId",
    telegramStep1: "用手机或电脑打开 Telegram。",
    telegramStep2: "搜索 @monad_gy_bot，或点下面「打开机器人」，再点 Start / 开始。没点过 Start，机器人发不了消息给你。",
    telegramStep3: "再搜索 @userinfobot（或点「查询我的 ID」），点 Start。它会回复一串纯数字，那就是 chatId。",
    telegramStep4: "把这串数字填进上面的框。不要填 @用户名，也不要加空格。",
    telegramOpenBot: "打开 @monad_gy_bot",
    telegramOpenId: "查询我的 ID（@userinfobot）",
    viewHistory: "查看历史通知",
    connectThenWatch: "先连接钱包，再付 $0.01 盯盘",
    opening: "加入中…",
    payAlert: "付 $0.01 盯这个盘",
    errEmail: "请填写有效邮箱。",
    errChannelNone: "请至少填写邮箱或 Telegram。",
    errAlready: "你已经盯过这个事件了。",
    errConnectMonad: "请先连接 Monad 钱包",
    errConnect: "请先连接钱包",
    errCancelled: "已取消签名。",
    errFunds: "测试网 USDC 不足。请到 faucet.circle.com 领取 Monad Testnet USDC。",
    alertsKicker: "第 3 屏",
    alertsTitle: "盯盘、通知与付款",
    paymentTitle: "付款记录",
    paymentEmpty: "还没有付款。付 $0.01 盯盘后会出现在这里。",
    paymentPaid: "已付 ${amount} USDC",
    paymentUnpaid: "未扣款（当时支付门关闭）",
    paymentNoTx: "还没有链上交易。钱包需有 Monad 测试网 USDC。",
    paymentNeedUsdc: "先到 Circle 水龙头领测试网 USDC，再点补付款。",
    paymentFaucet: "打开 Circle 水龙头",
    paymentRetry: "补付 $0.01",
    paymentRetrying: "付款中…",
    paymentOpenTx: "在浏览器查看",
    paymentWallet: "钱包",
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
    noAlerts: "还没有通知。新订阅会立刻扫一轮；也可以点「检查波动」，或等 Worker。",
    evidenceNews: "新闻",
    evidenceSocial: "社交",
    evidenceFlow: "资金",
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
    navPayments: "Payments",
    connect: "Connect",
    connecting: "…",
    switchNetwork: "Switch to Monad Testnet",
    homeKicker: "ERC-8004 · x402 · {network}",
    homeTitle: "A cent to watch a market. When it moves, you get why.",
    homeLead:
      "Pick a Polymarket event and pay $0.01 USDC. The first scan runs immediately. Every 5 minutes Pulse checks the last 5 minutes of YES, reads news, social, and book flow, then emails or Telegrams the address on that subscription.",
    homeCtaScan: "Pay $0.01 and watch",
    cardIdentity: "Identity",
    cardIdentityBody: "On-chain ERC-721 agent. Discoverable, transferable, points at HTTP + payout wallet.",
    cardPayment: "Payment",
    cardPaymentBody: "Watch one event for $0.01 via x402 USDC on Monad. Email, Telegram, or both — alerts go only to that subscription.",
    cardWatch: "Watch",
    cardWatchBody: "A first scan on subscribe. Then every 5 minutes: YES move, evidence, and a plain-language reason.",
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
    watchHint: "No threshold. When probability swings, Pulse checks news, social, and book flow, then says why it moved. Every event watch is $0.01.",
    poolPrice: "Price",
    poolMembers: "Watching this market",
    poolJoined: "{n} watching",
    notifyTip: "Enter email, Telegram, or both. Each watch notifies only the addresses on that row.",
    emailLabel: "Email",
    emailPlaceholder: "you@email.com",
    emailHint: "Demo sending uses Resend’s test from-address, which can only deliver to the email you used to sign up for Resend. Other inboxes may be rejected.",
    telegram: "Telegram chatId",
    telegramPlaceholder: "Digits only, e.g. 7898960928",
    telegramHow: "How to get your chatId",
    telegramStep1: "Open Telegram on your phone or computer.",
    telegramStep2: "Search @monad_gy_bot, or tap “Open bot” below, then tap Start. If you skip Start, the bot cannot message you.",
    telegramStep3: "Then open @userinfobot (or “Look up my ID”), tap Start. It replies with a number — that is your chatId.",
    telegramStep4: "Paste that number above. Do not use your @username, and do not add spaces.",
    telegramOpenBot: "Open @monad_gy_bot",
    telegramOpenId: "Look up my ID (@userinfobot)",
    viewHistory: "View notification history",
    connectThenWatch: "Connect, then pay $0.01 to watch",
    opening: "Joining…",
    payAlert: "Pay $0.01 to watch",
    errEmail: "Enter a valid email.",
    errChannelNone: "Enter an email, a Telegram chatId, or both.",
    errAlready: "You already watch this event.",
    errConnectMonad: "Connect a Monad wallet first",
    errConnect: "Connect a wallet first",
    errCancelled: "Signature cancelled.",
    errFunds: "Not enough testnet USDC. Use faucet.circle.com (Monad Testnet).",
    alertsKicker: "Screen 3",
    alertsTitle: "Watching, alerts & payments",
    paymentTitle: "Payments",
    paymentEmpty: "No payments yet. They show up after you pay $0.01 to watch.",
    paymentPaid: "Paid ${amount} USDC",
    paymentUnpaid: "Not charged (gate was off)",
    paymentNoTx: "No on-chain tx yet. The wallet needs Monad testnet USDC.",
    paymentNeedUsdc: "Claim testnet USDC from the Circle faucet, then tap Pay $0.01.",
    paymentFaucet: "Open Circle faucet",
    paymentRetry: "Pay $0.01 now",
    paymentRetrying: "Paying…",
    paymentOpenTx: "View on explorer",
    paymentWallet: "Wallet",
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
    noAlerts: "No alerts yet. A new watch scans immediately. You can also hit “Check for a swing”, or wait for the worker.",
    evidenceNews: "News",
    evidenceSocial: "Social",
    evidenceFlow: "Flow",
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
