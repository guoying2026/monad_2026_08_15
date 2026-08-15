/** One event-watch is $0.01 USDC for every subscriber. Compute still runs once. */
export const WATCH_COST_USDC = 0.01;

export type PoolQuote = {
  eventId: string;
  members: number;
  joinPriceUsdc: number;
};

export function formatUsdc(n: number) {
  if (n >= 0.01) return `$${n.toFixed(2)}`;
  if (n <= 0) return "$0";
  return `$${n.toFixed(4)}`;
}

export function quoteJoin(members: number, eventId = ""): PoolQuote {
  return {
    eventId,
    members: Math.max(0, members),
    joinPriceUsdc: WATCH_COST_USDC,
  };
}
