export type MarketOutcome = {
  id: string;
  label: string;
  question: string;
  yesPrice: number;
  noPrice: number;
  volume: number;
};

export type MarketEvent = {
  id: string;
  title: string;
  question: string;
  yesPrice: number;
  noPrice: number;
  volume: number;
  liquidity: number;
  endDate: string | null;
  url: string;
  source: "polymarket" | "demo";
  outcomes?: MarketOutcome[];
  marketIds?: string[];
};

export type ScanReport = {
  id: string;
  eventId: string;
  event: MarketEvent;
  headline: string;
  thesis: string;
  risks: string[];
  signals: { label: string; value: string }[];
  model: string;
  paid: boolean;
  paymentTx?: string;
  createdAt: string;
};

export type Subscription = {
  id: string;
  wallet: string;
  eventId: string;
  eventTitle: string;
  chatId: string;
  email: string;
  paid: boolean;
  paidUsdc: number;
  paymentTx?: string;
  active: boolean;
  lastYesPrice?: number;
  lastVolume?: number;
  lastFiredAt?: string;
  createdAt: string;
};

export type WatchPool = {
  eventId: string;
  eventTitle: string;
  lastYesPrice?: number;
  lastVolume?: number;
  lastFiredAt?: string;
  lastCheckedAt?: string;
  updatedAt: string;
};

export type AlertRecord = {
  id: string;
  subscriptionId: string;
  eventId: string;
  eventTitle: string;
  reason: string;
  snapshot: {
    yesPrice: number;
    volume: number;
    prevYesPrice?: number;
    deltaYes?: number;
    sources?: { kind: "news" | "social" | "flow"; title: string; source: string; url?: string }[];
  };
  telegramOk: boolean;
  emailOk: boolean;
  paymentTx?: string;
  createdAt: string;
};

export type FeedbackDraft = {
  useful: boolean;
  tag: "useful" | "inaccurate";
  note?: string;
  reportId?: string;
};
