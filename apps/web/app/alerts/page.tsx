"use client";

import { Suspense, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import type { AlertRecord, Subscription } from "@pulse/shared";
import { fetchHistory, fetchSubscriptions, postTick } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

function AlertsInner() {
  const { t } = useI18n();
  const { address } = useAccount();
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [watches, setWatches] = useState<Subscription[]>([]);
  const [tickBusy, setTickBusy] = useState(false);
  const [tickNote, setTickNote] = useState<string | null>(null);

  async function refreshTape() {
    const [history, subs] = await Promise.all([
      fetchHistory(address),
      fetchSubscriptions(address),
    ]);
    setAlerts(history.alerts);
    setWatches(subs.subscriptions.filter((s) => s.active));
  }

  useEffect(() => {
    void refreshTape().catch(() => undefined);
    const id = window.setInterval(() => {
      void refreshTape().catch(() => undefined);
    }, 8000);
    return () => window.clearInterval(id);
  }, [address]);

  return (
    <main className="mx-auto max-w-6xl px-5 py-12">
      <p className="text-xs font-medium text-accent">{t("alertsKicker")}</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight text-fg">{t("alertsTitle")}</h1>

      <section className="surface mt-8 overflow-hidden rounded-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3" style={{ background: "var(--accent-soft)" }}>
          <h2 className="text-sm font-semibold">{t("watchingTitle")}</h2>
          <button
            type="button"
            disabled={tickBusy || watches.length === 0}
            onClick={() => {
              setTickBusy(true);
              void postTick()
                .then(async (row) => {
                  setTickNote(t("checkSwingDone", { events: String(row.events ?? 0), fired: String(row.fired ?? 0) }));
                  await refreshTape();
                })
                .catch((err) => setTickNote(err instanceof Error ? err.message : t("feedbackFail")))
                .finally(() => setTickBusy(false));
            }}
            className="btn-primary !px-4 !py-1.5 !text-xs"
          >
            {tickBusy ? t("checkingSwing") : t("checkSwing")}
          </button>
        </div>
        <div className="px-5">
          {watches.length === 0 && <p className="py-4 text-sm text-muted">{t("watchingEmpty")}</p>}
          {watches.map((w) => (
            <div key={w.id} className="kv">
              <dt className="text-muted">{w.eventTitle}</dt>
              <dd className="text-xs font-medium">
                {w.email || w.chatId
                  ? [w.email, w.chatId ? "Telegram" : ""].filter(Boolean).join(" · ")
                  : t("watchingNone")}
              </dd>
            </div>
          ))}
        </div>
        {tickNote && <p className="px-5 pb-4 text-xs text-muted">{tickNote}</p>}
      </section>

      <h2 className="mt-10 text-sm font-semibold text-fg">{t("alertHistory")}</h2>
      <div className="mt-3 space-y-3">
        {alerts.length === 0 && <p className="text-sm text-muted">{t("noAlerts")}</p>}
        {alerts.map((a) => (
          <article key={a.id} className="surface rounded-card p-4">
            <div className="flex justify-between gap-3 text-xs text-muted">
              <span>{new Date(a.createdAt).toLocaleString()}</span>
              <span className="rounded-full bg-chip px-2 py-0.5">
                {a.telegramOk && a.emailOk
                  ? t("bothSent")
                  : a.telegramOk
                    ? t("telegramSent")
                    : a.emailOk
                      ? t("emailSent")
                      : t("loggedOnly")}
              </span>
            </div>
            <h3 className="mt-2 text-sm font-medium">{a.eventTitle}</h3>
            {(a.snapshot.window || a.snapshot.trend) && (
              <p className="mt-1 text-xs text-accent">
                {[a.snapshot.window, a.snapshot.trend].filter(Boolean).join(" · ")}
              </p>
            )}
            <p className="mt-1 text-sm text-muted">{a.reason}</p>
            {a.snapshot.sources && a.snapshot.sources.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-muted">
                {a.snapshot.sources.map((src, i) => (
                  <li key={`${a.id}-${i}`}>
                    <span className="mr-1 rounded-full bg-chip px-1.5 py-0.5">
                      {src.kind === "news" ? t("evidenceNews") : src.kind === "social" ? t("evidenceSocial") : t("evidenceFlow")}
                    </span>
                    {src.url ? (
                      <a href={src.url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                        {src.title}
                      </a>
                    ) : (
                      src.title
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs font-medium text-accent">
              YES{" "}
              {a.snapshot.prevYesPrice != null
                ? `${(a.snapshot.prevYesPrice * 100).toFixed(1)}% → ${(a.snapshot.yesPrice * 100).toFixed(1)}%`
                : `${(a.snapshot.yesPrice * 100).toFixed(1)}%`}
              {a.snapshot.deltaYes != null
                ? ` (${a.snapshot.deltaYes >= 0 ? "+" : ""}${(a.snapshot.deltaYes * 100).toFixed(1)}pt)`
                : ""}
              {" · "}vol {a.snapshot.volume.toLocaleString()}
            </p>
          </article>
        ))}
      </div>
    </main>
  );
}

export default function AlertsPage() {
  return (
    <Suspense fallback={<main className="px-5 py-12 text-sm text-muted">…</main>}>
      <AlertsInner />
    </Suspense>
  );
}
