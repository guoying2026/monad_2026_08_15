# Pulse — Monad 上的预测市场盯盘 Agent

Pulse 是跑在 [Monad](https://www.monad.xyz) 上的 ERC-8004 Agent：选一个 [Polymarket](https://polymarket.com) 事件，付 **$0.01 USDC**（[x402](https://docs.monad.xyz/guides/x402)），之后由 Agent 盯 YES 概率。波动来了，它会对照新闻、社交和盘口资金，用邮件或 Telegram 写清楚「为什么涨 / 为什么跌」。

个人扫盘报告免费。每个事件只算一次，再按订阅者扇出通知——适合 Monad 的 ~0.3s 出块、单槽最终性和极低 gas：小额 USDC 按次结算不会堵，也不会被手续费吃掉。

```
钱包付 $0.01 盯盘
        │
        ▼
  ERC-8004 身份（可发现、可评价）
        │
        ▼
  Worker 每 5 分钟扫 YES
        │
        ├── 新闻 / 社交 / 成交资金
        ├── LLM 写原因（无 Key 时用规则引擎）
        └── 邮件 · Telegram · 结果页
```

## 它做什么

- **免费扫盘**：对任意 Polymarket 事件出一份短报告（隐含概率、量、流动性、风险）。
- **一分钱盯盘**：`POST /subscribe` 经 x402 收 $0.01 USDC。同一钱包对同一事件只能订一次。
- **立刻扫一轮，之后按窗口对比**：订阅成功马上扫；之后默认每 5 分钟看过去 5 分钟的 YES 变动，并对照 1 小时 / 6 小时 / 1 天 / 7 天 / 30 天（有历史才写）。
- **带证据的通知**：Google News、Reddit、X、Polymarket 成交净流入。原因写进邮件 / Telegram / 结果页。
- **链上身份与声誉**：Identity Registry 铸 ERC-721；结果页「有用 / 不准」调 Reputation Registry。

前端三屏：首页介绍、选盘结算、个人中心（订阅、付款、通知、反馈）。中英切换，明暗主题。

## 仓库结构

pnpm workspace。Node ≥ 20。

```
apps/web              Next.js 15 前端（wagmi / viem / x402 客户端）
apps/api              Express Agent HTTP：扫盘、订阅、8004 card、x402、Worker tick
apps/worker           按间隔 POST /internal/tick
packages/shared       Monad 网络、USDC、Registry、ABI、类型
packages/agent-card   ERC-8004 registration file
```

| 进程 | 默认地址 |
| --- | --- |
| Web | http://localhost:3000 |
| API | http://localhost:4000 |
| Agent Card | http://localhost:4000/.well-known/agent-card.json |

数据落 MySQL（订阅、通知、扫盘报告、价格点）。首次启动会把旧的 `apps/.data/events/*.json` 迁进去。刷新和重启都还在。

## 盯盘怎么跑

1. 用户在 `/scan` 搜 Polymarket（关键词或事件链接），填邮箱和/或 Telegram `chatId`，连钱包付 $0.01。
2. API 写入 `subscriptions`，立刻对该事件跑一次 `scanEvent`（首次一定通知）。
3. Worker 轮询 `/internal/tick`。每个事件在间隔内只检测一次；同一盘的所有订阅者共用这一次计算。
4. 对照本地 `event_quotes` + Polymarket 历史价。主窗口是 5 分钟；更长窗口只作对照。形态：匀速升/降、突然跳变、近期加速、来回震荡。
5. 取证 + LLM（或规则引擎）写成原因，按**这条订阅里填的地址**发邮件 / Telegram，并写入 `alerts`。

`WATCH_INTERVAL_MINUTES` 改完下一轮生效，不用重启 Worker。

## 本地启动

需要：Node 20+、pnpm 9、本机 MySQL。

1. 读官方两篇：[ERC-8004](https://docs.monad.xyz/guides/erc-8004) · [x402](https://docs.monad.xyz/guides/x402)
2. 钱包（开发用）+ [Monad faucet](https://faucet.monad.xyz) 的 MON + [Circle faucet](https://faucet.circle.com) 的 Monad Testnet USDC
3. 可选：OpenAI 兼容 LLM Key、Telegram Bot Token（`@BotFather`）、[Resend](https://resend.com) 发信 Key

```bash
cd monad_2026_08_15
cp .env.example .env
# 填 PAY_TO_ADDRESS；开发阶段保持 SKIP_X402=true
# 确认 DATABASE_URL 能连上 MySQL（默认 mysql://root@127.0.0.1:3306/pulse，库不存在会自动建）
pnpm install
pnpm dev
```

单独起进程：`pnpm dev:api` / `pnpm dev:web` / `pnpm dev:worker`。类型检查：`pnpm typecheck`。

开发时 `SKIP_X402=true`，`/subscribe` 不扣款。打开支付后再走钱包签 EIP-3009（gas 由 facilitator 出）。

## 注册 Agent（ERC-8004）

Agent Card 由 API 现场生成（名字、能力、HTTP endpoint、收款地址）。本地 HTTP 的 URI 上不了 8004scan：把 `PUBLIC_API_URL` / `AGENT_URI` 指到已部署的 HTTPS，或用 `--onchain` 把 JSON 打成 `data:` URI。

```bash
# .env 里填 PRIVATE_KEY、PAY_TO_ADDRESS、AGENT_URI
pnpm register
# 元数据完全上链：
pnpm --filter @pulse/api exec tsx src/register.ts --onchain
```

把打印出的 `agentId` 写回 `.env` 的 `AGENT_ID` 和 `NEXT_PUBLIC_AGENT_ID`。到 [8004scan](https://www.8004scan.io) 搜 Pulse / 该 ID。

| 网络 | Identity Registry | Reputation Registry |
| --- | --- | --- |
| Testnet（`eip155:10143`） | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |
| Mainnet（`eip155:143`） | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` |

切主网：`MONAD_NETWORK=mainnet`。

## 打开 x402 收费

```
SKIP_X402=false
PAY_TO_ADDRESS=0x你的收款地址
FACILITATOR_URL=https://x402-facilitator.molandak.org
```

前端连钱包 → 签 EIP-3009 → 自动带支付头重试 `/subscribe`。`/scan` 个人报告不收费。个人中心里可以对未上链的订阅补付 $0.01。

| 网络 | CAIP-2 | USDC | EIP-712 name |
| --- | --- | --- | --- |
| Testnet | `eip155:10143` | `0x534b2f3A21130d7a60830c2Df862319e593943A3` | `USDC` / `2` |
| Mainnet | `eip155:143` | `0x754704Bc059F8C67012fEd69BC8A327a5aafb603` | `USD Coin` / `2` |

## API

收费路由只有 `POST /subscribe`。其余只读或内部接口免费。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | 存活、网络、是否跳过 x402 |
| GET | `/.well-known/agent-card.json` | ERC-8004 Agent Card |
| GET | `/config` | 前端用的网络、收款、Registry、反馈 ABI |
| GET | `/events?q=` | 热门或搜索 Polymarket；可贴事件链接 |
| POST | `/scan` | 免费个人报告。body：`{ eventId }` |
| POST | `/subscribe` | 盯盘。body：`wallet`、`eventId`、可选 `email` / `chatId`。未付款 402 |
| GET | `/subscriptions?wallet=` | 该钱包的订阅 |
| GET | `/payments?wallet=` | 付款记录 |
| POST | `/payments/confirm` | 把链上 tx 挂到已有订阅 |
| GET | `/alerts?wallet=` | 通知 + 扫盘历史 |
| POST | `/internal/tick` | Worker 调用。`?force=1` 忽略间隔 |

试扫（支付门关闭时）：

```bash
curl -s http://localhost:4000/events | jq '.events[0].id'
curl -s -X POST http://localhost:4000/scan \
  -H 'content-type: application/json' \
  -d '{"eventId":"demo-btc-150k"}' | jq '.report.headline'
```

Gamma API 不可用时会回落到内置 demo 事件（`demo-btc-150k` 等）。

## 前端

1. `/` Agent 介绍 + Identity Registry / 收款地址 / 8004scan
2. `/scan` 搜盘、看订阅池人数、填通知渠道、付 $0.01
3. `/alerts` 正在盯的盘、付款记录、通知历史（原因 + 新闻/社交/资金）、Useful / Inaccurate

没填 `AGENT_ID` 时反馈停在 UI 提示，不发链上交易。

## 环境变量

见 `.env.example`。最少填 `PAY_TO_ADDRESS`。打开收费后再填 `PRIVATE_KEY`（仅注册脚本需要）并关掉 `SKIP_X402`。

| 变量 | 作用 |
| --- | --- |
| `MONAD_NETWORK` | `testnet`（默认）或 `mainnet` |
| `DATABASE_URL` | MySQL，默认 `mysql://root@127.0.0.1:3306/pulse` |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL` | 兼容接口；未配置则规则引擎 |
| `TELEGRAM_BOT_TOKEN` | 缺了只记日志，不发消息 |
| `RESEND_API_KEY` / `EMAIL_FROM` | 缺了只记日志。演示阶段 Resend 测试发件人通常只能发到注册邮箱 |
| `WATCH_INTERVAL_MINUTES` | 每个事件检测间隔，默认 5 |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | 可选，钱包连接 |

## 部署

- **API + Worker**：Railway / Render / VPS。切 `MONAD_NETWORK` 与 `PUBLIC_API_URL`（必须 HTTPS，8004scan 才打得开 card）
- **Web**：Vercel，`NEXT_PUBLIC_API_URL` 指到 API
- Demo 60–90s：注册 → 免费出报告 → 付 $0.01 盯盘/推送 →（可选）反馈

## 为何是 Monad

x402 要的是「每调用一笔、立刻最终、费用可忽略」。Monad 并行执行 + 单槽最终性让 agent 对 agent 的小额 USDC 能当 HTTP 状态码用，而不是当一笔要等确认的转账。ERC-8004 的 Identity / Reputation 已在测试网和主网同地址族部署，发现和付款在同一条链上完成。
