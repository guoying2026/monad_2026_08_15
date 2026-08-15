"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { monadChain } from "@/lib/chain";

export function Nav() {
  const path = usePathname();
  const { t, locale, setLocale } = useI18n();
  const { theme, toggle } = useTheme();
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const wrong = isConnected && chainId !== monadChain.id;
  const links = [
    { href: "/", label: t("navAgent") },
    { href: "/scan", label: t("navScan") },
    { href: "/alerts", label: t("navAlerts") },
  ];

  return (
    <header className="sticky top-0 z-20 border-b border-line" style={{ background: "var(--nav)" }}>
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-6 px-5">
        <Link href="/" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-fg">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-accent text-[11px] font-bold text-accent-fg">
            P
          </span>
          Pulse
        </Link>
        <nav className="hidden items-center gap-5 text-[13px] text-muted lg:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={path === l.href ? "font-medium text-fg" : "hover:text-fg"}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <div className="flex rounded-full bg-chip p-0.5 text-[11px] font-medium">
            <button
              type="button"
              onClick={() => setLocale("zh")}
              className={`rounded-full px-2.5 py-1 ${locale === "zh" ? "bg-accent text-accent-fg" : "text-muted"}`}
            >
              中
            </button>
            <button
              type="button"
              onClick={() => setLocale("en")}
              className={`rounded-full px-2.5 py-1 ${locale === "en" ? "bg-accent text-accent-fg" : "text-muted"}`}
            >
              EN
            </button>
          </div>
          {wrong && (
            <button
              type="button"
              onClick={() => switchChain({ chainId: monadChain.id })}
              className="rounded-full bg-danger px-3 py-1.5 text-xs font-medium text-white"
            >
              {t("switchNetwork")}
            </button>
          )}
          {isConnected && address ? (
            <button
              type="button"
              onClick={() => disconnect()}
              className="rounded-full bg-chip px-3 py-1.5 text-xs font-medium text-muted"
            >
              {address.slice(0, 6)}…{address.slice(-4)}
            </button>
          ) : (
            <button
              type="button"
              disabled={isPending}
              onClick={() => connect({ connector: connectors[0] })}
              className="btn-primary !px-4 !py-1.5 !text-xs"
            >
              {isPending ? t("connecting") : t("connect")}
            </button>
          )}
          <button
            type="button"
            onClick={toggle}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-chip hover:text-fg"
            aria-label={theme === "dark" ? "Switch to light" : "Switch to dark"}
          >
            {theme === "dark" ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21 14.3A8.5 8.5 0 0 1 9.7 3 7 7 0 1 0 21 14.3Z" />
              </svg>
            )}
          </button>
        </div>
      </div>
      <nav className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-line px-5 py-2 text-xs text-muted lg:hidden">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={path === l.href ? "font-medium text-fg" : ""}
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
