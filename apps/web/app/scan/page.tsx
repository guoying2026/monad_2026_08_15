"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useWalletClient } from "wagmi";
import { apiUrl, fetchConfig, fetchEvents, polymarketSlug, type AgentConfig, type EventWithPool } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { paidFetch } from "@/lib/x402";

export default function ScanPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const [events, setEvents] = useState<EventWithPool[]>([]);
  const [cfg, setCfg] = useState<AgentConfig | null>(null);
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [eventId, setEventId] = useState("");
  const [email, setEmail] = useState("");
  const [chatId, setChatId] = useState("");
  const [busy, setBusy] = useState<"sub" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchGen = useRef(0);
  const queryRef = useRef("");
  const debounceRef = useRef<number>(0);

  useEffect(() => {
    fetchConfig().then(setCfg).catch(() => undefined);
    void runSearch("");
    return () => window.clearTimeout(debounceRef.current);
  }, []);

  async function runSearch(raw: string) {
    const q = raw.trim();
    queryRef.current = q;
    const gen = ++searchGen.current;
    setError(null);
    setLoadingList(true);
    setSearched(Boolean(q));
    if (q) setEventId("");
    try {
      const rows = await fetchEvents(q);
      if (stale(gen, q)) return;
      const hit = pickSearchHit(rows, q);
      const ordered = hit ? [hit, ...rows.filter((e) => e.id !== hit.id)] : rows;
      setEvents(ordered);
      setEventId(hit?.id ?? "");
    } catch (err) {
      if (stale(gen, q)) return;
      setError(friendly(err, t));
    } finally {
      if (!stale(gen, q)) setLoadingList(false);
    }
  }

  function stale(gen: number, q: string) {
    return gen !== searchGen.current || queryRef.current !== q;
  }

  function onQueryChange(value: string) {
    setQuery(value);
    const trimmed = value.trim();
    queryRef.current = trimmed;
    window.clearTimeout(debounceRef.current);
    if (!trimmed) {
      void runSearch("");
      return;
    }
    setEventId("");
    if (polymarketSlug(trimmed)) {
      void runSearch(trimmed);
      return;
    }
    debounceRef.current = window.setTimeout(() => {
      void runSearch(trimmed);
    }, 400);
  }

  function onSearch(e?: FormEvent) {
    e?.preventDefault();
    window.clearTimeout(debounceRef.current);
    void runSearch(query);
  }

  const selected = events.find((e) => e.id === eventId);

  async function postJson(path: string, body: unknown, pay: boolean) {
    const init: RequestInit = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    };
    if (pay && cfg && !cfg.skipX402) {
      if (!walletClient || !address) throw new Error(t("errConnectMonad"));
      return paidFetch(walletClient, address, `${apiUrl}${path}`, init);
    }
    return fetch(`${apiUrl}${path}`, init);
  }

  async function onSubscribe() {
    setError(null);
    setBusy("sub");
    try {
      if (!address) throw new Error(t("errConnect"));
      const mail = email.trim();
      const tg = chatId.trim();
      if (!mail && !tg) throw new Error(t("errChannelNone"));
      if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
        throw new Error(t("errEmail"));
      }
      const res = await postJson(
        "/subscribe",
        {
          eventId,
          wallet: address,
          email: mail,
          chatId: tg,
        },
        true,
      );
      if (res.status === 409) throw new Error(t("errAlready"));
      if (!res.ok) throw new Error(await readErr(res));
      router.push("/alerts?watching=1");
    } catch (err) {
      setError(friendly(err, t));
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto grid max-w-6xl gap-8 px-5 py-12 lg:grid-cols-[1.15fr_0.85fr]">
      <section>
        <p className="text-xs font-medium text-accent">{t("scanKicker")}</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-fg">{t("scanTitle")}</h1>
        <p className="mt-3 text-[15px] leading-7 text-muted">
          {cfg?.skipX402
            ? t("scanSkip")
            : t("scanPaid", {
                price: cfg?.price ?? "$0.01",
                network: cfg?.network.displayName ?? "Monad",
              })}
        </p>

        <form onSubmit={(e) => void onSearch(e)} className="mt-8">
          <label className="block text-xs font-medium text-muted">
            {t("searchLabel")}
            <div className="relative mt-2">
              <input
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                onPaste={(e) => {
                  const text = e.clipboardData.getData("text");
                  if (/polymarket\.com\/(event|market)\//i.test(text)) {
                    e.preventDefault();
                    onQueryChange(text.trim());
                  }
                }}
                placeholder={t("searchPlaceholder")}
                className="field !mt-0 pr-12"
              />
              <button
                type="submit"
                disabled={loadingList}
                aria-label={t("searchButton")}
                className="absolute right-1 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-accent text-accent-fg disabled:opacity-50"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.2-3.2" />
                </svg>
              </button>
            </div>
          </label>
          <p className="mt-2 text-xs leading-5 text-muted">{loadingList ? t("searching") : t("searchHint")}</p>
        </form>

        <div className="mt-7 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onQueryChange("")}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              !searched ? "bg-accent text-accent-fg" : "bg-chip text-muted"
            }`}
          >
            {t("trending")}
          </button>
          {searched && (
            <span className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-fg">
              {t("searchButton")}
            </span>
          )}
        </div>
        {searched && !loadingList && events.length === 0 && (
          <p className="mt-4 text-sm text-muted">{t("noResults")}</p>
        )}
        <ul className="mt-4 space-y-2">
          {events.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => setEventId(e.id)}
                className={`w-full rounded-card border px-4 py-3.5 text-left ${
                  eventId === e.id ? "border-accent bg-[var(--accent-soft)]" : "surface"
                }`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium">{e.title}</span>
                  <span className="text-xs font-semibold text-accent">{(e.yesPrice * 100).toFixed(1)}%</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span>vol {e.volume.toLocaleString()}</span>
                  {e.outcomes && e.outcomes.length > 1 && (
                    <>
                      <span>·</span>
                      <span>{t("outcomes", { n: String(e.outcomes.length) })}</span>
                    </>
                  )}
                  <span>·</span>
                  <span>{t("poolJoined", { n: String(e.pool?.members ?? 0) })}</span>
                  <span>·</span>
                  <span className="text-accent">$0.01</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <aside className="surface h-fit overflow-hidden rounded-card">
        <div className="border-b border-line px-5 py-3" style={{ background: "var(--accent-soft)" }}>
          <h2 className="text-sm font-semibold">{t("checkout")}</h2>
        </div>
        <div className="p-5">
          {selected ? (
            <>
              <p className="text-xs font-medium text-muted">{t("selectedMarket")}</p>
              <p className="mt-1 text-sm font-semibold leading-6">{selected.title}</p>
              {selected.outcomes && selected.outcomes.length > 1 ? (
                <div className="mt-3">
                  {selected.outcomes
                    .slice()
                    .sort((a, b) => b.yesPrice - a.yesPrice)
                    .map((o) => (
                      <div key={o.id} className="kv">
                        <dt className="text-muted">{o.label}</dt>
                        <dd className="font-medium">{(o.yesPrice * 100).toFixed(1)}%</dd>
                      </div>
                    ))}
                </div>
              ) : selected.question !== selected.title ? (
                <p className="mt-2 text-sm leading-6 text-muted">{selected.question}</p>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted">{loadingList ? t("searching") : t("noResults")}</p>
          )}
          <p className="mt-4 text-sm leading-6 text-muted">{t("watchHint")}</p>
          {selected?.pool && (
            <div className="mt-4">
              <div className="kv">
                <dt className="text-muted">{t("poolPrice")}</dt>
                <dd className="font-semibold text-accent">$0.01</dd>
              </div>
              <div className="kv">
                <dt className="text-muted">{t("poolMembers")}</dt>
                <dd className="font-medium">{t("poolJoined", { n: String(selected.pool.members) })}</dd>
              </div>
            </div>
          )}

          <p className="mt-5 text-xs leading-5 text-muted">{t("notifyTip")}</p>
          <label className="mt-3 block text-xs font-medium text-muted">
            {t("emailLabel")}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("emailPlaceholder")}
              className="field mt-2"
            />
          </label>
          <p className="mt-2 text-xs leading-5 text-muted">{t("emailHint")}</p>
          <label className="mt-4 block text-xs font-medium text-muted">
            {t("telegram")}
            <input
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder={t("telegramPlaceholder")}
              className="field mt-2"
              inputMode="numeric"
            />
          </label>
          <div className="mt-3 rounded-xl border border-line bg-chip/40 px-3.5 py-3">
            <p className="text-xs font-medium text-fg">{t("telegramHow")}</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-xs leading-5 text-muted">
              <li>{t("telegramStep1")}</li>
              <li>{t("telegramStep2")}</li>
              <li>{t("telegramStep3")}</li>
              <li>{t("telegramStep4")}</li>
            </ol>
            <div className="mt-3 flex flex-col gap-2">
              <a
                href="https://t.me/monad_gy_bot"
                target="_blank"
                rel="noreferrer"
                className="text-xs font-medium text-accent underline-offset-2 hover:underline"
              >
                {t("telegramOpenBot")}
              </a>
              <a
                href="https://t.me/userinfobot"
                target="_blank"
                rel="noreferrer"
                className="text-xs font-medium text-accent underline-offset-2 hover:underline"
              >
                {t("telegramOpenId")}
              </a>
            </div>
          </div>

          <button
            type="button"
            disabled={!eventId || busy !== null}
            onClick={() => void onSubscribe()}
            className="btn-primary mt-6 w-full"
          >
            {busy === "sub"
              ? t("opening")
              : isConnected || cfg?.skipX402
                ? t("payAlert")
                : t("connectThenWatch")}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => router.push("/alerts")}
            className="btn-ghost mt-3 w-full"
          >
            {t("viewHistory")}
          </button>
          {error && <p className="mt-4 text-sm text-danger">{error}</p>}
        </div>
      </aside>
    </main>
  );
}

async function readErr(res: Response) {
  const text = await res.text();
  try {
    const json = JSON.parse(text) as { error?: string };
    return json.error || text || `${res.status}`;
  } catch {
    return text || `${res.status}`;
  }
}

function friendly(err: unknown, t: (key: "errCancelled" | "errFunds") => string) {
  const message = err instanceof Error ? err.message : String(err);
  if (/user rejected|denied|cancelled/i.test(message)) return t("errCancelled");
  if (/insufficient/i.test(message)) return t("errFunds");
  return message;
}

function pickSearchHit(rows: EventWithPool[], q: string): EventWithPool | undefined {
  const slug = polymarketSlug(q) || q.trim();
  if (!slug) return rows[0];
  const hit = rows.find((e) => eventMatchesSlug(e, slug));
  if (hit) return hit;
  return polymarketSlug(q) ? undefined : rows[0];
}

function eventMatchesSlug(event: EventWithPool, slug: string): boolean {
  const tail = event.url.split("/").filter(Boolean).pop() ?? "";
  const blob = [event.id, event.url, event.title, event.question, ...(event.outcomes ?? []).map((o) => o.id)]
    .join(" ")
    .toLowerCase();
  return (
    event.id === slug ||
    tail === slug ||
    event.url.includes(`/event/${slug}`) ||
    event.url.includes(`/market/${slug}`) ||
    slug.startsWith(`${tail}-`) ||
    tail.startsWith(`${slug}-`) ||
    blob.includes(slug.toLowerCase())
  );
}
