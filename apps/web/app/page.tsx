"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { fetchConfig, type AgentConfig } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { network, publicAgentId } from "@/lib/chain";

export default function HomePage() {
  const { t } = useI18n();
  const [cfg, setCfg] = useState<AgentConfig | null>(null);

  useEffect(() => {
    fetchConfig()
      .then(setCfg)
      .catch(() => setCfg(null));
  }, []);

  const agentId = cfg?.agentId || publicAgentId || null;
  const registry = cfg?.identityRegistry || network.identityRegistry;
  const payTo = cfg?.payTo || "";

  return (
    <main className="mx-auto max-w-6xl px-5 py-12">
      <p className="text-xs font-medium text-accent">
        {t("homeKicker", { network: network.displayName })}
      </p>
      <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-fg sm:text-5xl">
        {t("homeTitle")}
      </h1>
      <p className="mt-4 max-w-2xl text-[15px] leading-7 text-muted">{t("homeLead")}</p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/scan" className="btn-primary">
          {t("homeCtaScan")}
        </Link>
      </div>

      <section className="mt-12 grid gap-4 md:grid-cols-3">
        {(
          [
            ["cardIdentity", "cardIdentityBody"],
            ["cardPayment", "cardPaymentBody"],
            ["cardWatch", "cardWatchBody"],
          ] as const
        ).map(([title, body]) => (
          <article key={title} className="surface rounded-card p-5">
            <h2 className="text-sm font-semibold text-fg">{t(title)}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{t(body)}</p>
          </article>
        ))}
      </section>

      <section className="surface mt-8 overflow-hidden rounded-card">
        <div className="border-b border-line px-5 py-3" style={{ background: "var(--accent-soft)" }}>
          <h2 className="text-sm font-semibold text-fg">{t("onchainCard")}</h2>
        </div>
        <div className="px-5">
          <div className="kv">
            <dt className="text-muted">{t("labelAgent")}</dt>
            <dd className="font-medium">Pulse {agentId ? `#${agentId}` : t("agentPending")}</dd>
          </div>
          <div className="kv">
            <dt className="text-muted">{t("labelRegistry")}</dt>
            <dd className="flex items-center gap-1.5 font-mono text-xs">
              <span className="break-all text-accent">{registry}</span>
              <CopyButton value={registry} />
            </dd>
          </div>
          <div className="kv">
            <dt className="text-muted">{t("labelPayTo")}</dt>
            <dd className="flex items-center gap-1.5 font-mono text-xs">
              <span className="break-all text-accent">{payTo || t("setPayTo")}</span>
              {payTo ? <CopyButton value={payTo} /> : null}
            </dd>
          </div>
          <div className="kv">
            <dt className="text-muted">{t("labelX402")}</dt>
            <dd className="font-medium">{cfg?.skipX402 ? t("demoMode") : cfg?.price || "$0.01 USDC"}</dd>
          </div>
        </div>
      </section>
    </main>
  );
}
