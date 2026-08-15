"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAccount, useWriteContract } from "wagmi";
import type { AlertRecord, ScanReport, Subscription } from "@pulse/shared";
import { reputationAbi } from "@pulse/shared";
import { fetchConfig, fetchHistory, fetchSubscriptions, postTick, type AgentConfig } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { network } from "@/lib/chain";

function AlertsInner() {
  const { t } = useI18n();
  const params = useSearchParams();
  const { address } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();
  const [cfg, setCfg] = useState<AgentConfig | null>(null);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [scans, setScans] = useState<ScanReport[]>([]);
  const [watches, setWatches] = useState<Subscription[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [tickBusy, setTickBusy] = useState(false);
  const [tickNote, setTickNote] = useState<string | null>(null);

  useEffect(() => {
    fetchConfig().then(setCfg).catch(() => undefined);
  }, []);

  async function refreshTape() {
    const cached = sessionStorage.getItem("pulse:lastScan");
    if (cached) {
      const report = JSON.parse(cached) as ScanReport;
      setScans((prev) => (prev.some((s) => s.id === report.id) ? prev : [report, ...prev]));
    }
    const [history, subs] = await Promise.all([
      fetchHistory(address),
      fetchSubscriptions(address),
    ]);
    setAlerts(history.alerts);
    setWatches(subs.subscriptions.filter((s) => s.active));
    setScans((prev) => {
      const ids = new Set(prev.map((s) => s.id));
      return [...prev, ...history.scans.filter((s) => !ids.has(s.id))];
    });
  }

  useEffect(() => {
    void refreshTape().catch(() => undefined);
    const id = window.setInterval(() => {
      void refreshTape().catch(() => undefined);
    }, 8000);
    return () => window.clearInterval(id);
  }, [address]);

  const focusId = params.get("scan");
  const report = useMemo(
    () => scans.find((s) => s.id === focusId) || scans[0],
    [scans, focusId],
  );

  async function feedback(useful: boolean) {
    const agentId = cfg?.agentId;
    if (!agentId) {
      setNote(t("feedbackNoId"));
      return;
    }
    try {
      const hash = await writeContractAsync({
        address: cfg.feedback.address,
        abi: reputationAbi,
        functionName: "giveFeedback",
        args: [
          BigInt(agentId),
          BigInt(useful ? 100 : 20),
          0,
          useful ? "useful" : "inaccurate",
          "scan",
          `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/scan`,
          "",
          "0x0000000000000000000000000000000000000000000000000000000000000000",
        ],
      });
      setNote(t("feedbackTx", { hash }));
    } catch (err) {
      setNote(err instanceof Error ? err.message : t("feedbackFail"));
    }
  }

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

      {report ? (
        <article className="surface mt-8 overflow-hidden rounded-card">
          <div className="border-b border-line px-5 py-3" style={{ background: "var(--accent-soft)" }}>
            <p className="text-xs font-medium text-accent">{report.model}</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">{report.headline}</h2>
          </div>
          <div className="p-5">
            <p className="max-w-3xl text-[15px] leading-7 text-muted">{report.thesis}</p>
            <div className="mt-5">
              {report.signals.map((s) => (
                <div key={s.label} className="kv">
                  <dt className="text-muted">{s.label}</dt>
                  <dd className="font-medium">{s.value}</dd>
                </div>
              ))}
            </div>
            <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-muted">
              {report.risks.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            {report.paymentTx && (
              <a
                className="mt-4 inline-block text-xs font-medium text-accent"
                href={network.explorerTx(report.paymentTx)}
                target="_blank"
                rel="noreferrer"
              >
                {t("payment")} {report.paymentTx.slice(0, 10)}…
              </a>
            )}
            <div className="mt-6 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={() => void feedback(true)}
                className="btn-primary !px-4 !py-2 !text-xs"
              >
                {t("useful")}
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => void feedback(false)}
                className="btn-ghost !px-4 !py-2 !text-xs"
              >
                {t("inaccurate")}
              </button>
            </div>
            {note && <p className="mt-3 text-xs text-muted">{note}</p>}
          </div>
        </article>
      ) : (
        <p className="mt-8 text-sm text-muted">{t("noReport")}</p>
      )}

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
            <p className="mt-1 text-sm text-muted">{a.reason}</p>
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
