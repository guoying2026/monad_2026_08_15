import type { Metadata } from "next";
import Script from "next/script";
import { Inter, IBM_Plex_Mono, Noto_Sans_SC } from "next/font/google";
import { Nav } from "@/components/nav";
import { Providers } from "@/components/providers";
import "./globals.css";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500"],
});

const sc = Noto_Sans_SC({
  subsets: ["latin"],
  variable: "--font-sc",
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "Pulse — Monad prediction watch",
  description: "ERC-8004 agent. x402 USDC micropayments. Telegram alerts with a reason.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="light">
      <body className={`${sans.variable} ${mono.variable} ${sc.variable} font-sans antialiased`}>
        <Script id="theme-boot" strategy="beforeInteractive">
          {`try{var t=localStorage.getItem('pulse:theme');document.documentElement.classList.toggle('dark',t==='dark');document.documentElement.classList.toggle('light',t!=='dark')}catch(e){}`}
        </Script>
        <Script id="ignore-ext-errors" strategy="beforeInteractive">
          {`(function(){function ign(m,s){m=String(m||'');s=String(s||'');return s.indexOf('chrome-extension://')===0||s.indexOf('moz-extension://')===0||m.indexOf('sseError')!==-1}window.addEventListener('error',function(e){if(ign(e.message,e.filename)){e.preventDefault();e.stopImmediatePropagation()}},true);window.addEventListener('unhandledrejection',function(e){var r=e.reason;if(ign(r&&r.message||r,'')){e.preventDefault();e.stopImmediatePropagation()}},true)})()`}
        </Script>
        <Providers>
          <Nav />
          {children}
        </Providers>
      </body>
    </html>
  );
}
