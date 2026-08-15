# Pulse — Monad 上的 ERC-8004 + x402 预测市场 Agent

个人扫盘报告免费。付 $0.01 USDC 订阅一个 Polymarket 事件的盯盘。每个盘只计算一次，再扇出通知。Agent 自己发现 YES 概率波动后再推 Telegram。

适合 Monad：~0.3s 出块、单槽最终性、极低 gas，小额 USDC 按次结算不会堵、也不会被手续费吃掉。

## 一条线

```
本地环境 → Monad RPC → 注册 ERC-8004
    → 可调用服务（/scan 分析 · /subscribe 盯盘）
    → x402 收费盯盘（/subscribe $0.01；/scan 报告免费）
    → Worker 轮询 + Telegram
    → 三屏前端 Demo
    → 测试网 / 主网
```

| 阶段 | 目标 | 怎么验收 |
| --- | --- | --- |
| 0 准备 | `.env` + `pnpm install` | API `/health` 200 |
| 1 身份 | `pnpm register` 铸 ERC-721 | [8004scan](https://www.8004scan.io) 能搜到 Pulse |
| 2 能力 | `SKIP_X402=true` 调 `/scan` `/subscribe` | 报告站得住；Worker 能推/打日志 |
| 3 付费 | `SKIP_X402=false`，钱包付 $0.01 盯盘 | `/subscribe` 没付款 402；`/scan` 免费出报告 |
| 4 声誉 | 结果页点 Useful / Inaccurate | 调 Reputation Registry（可先 Mock） |
| 5 前端 | `/` `/scan` `/alerts` | 评委三屏 |
| 6 部署 | Railway / Vercel + 60–90s 录像 | README 能讲清 8004 / x402 / Monad |

## 仓库

```
apps/web          Next.js 三屏 Demo
apps/api          Agent HTTP（scan / subscribe / 8004 card / x402）
apps/worker       每 N 秒 POST /internal/tick
packages/shared   Monad 地址、ABI、类型
packages/agent-card   ERC-8004 registration file
```

## 阶段 0：准备

1. 读官方两篇：[ERC-8004](https://docs.monad.xyz/guides/erc-8004) · [x402](https://docs.monad.xyz/guides/x402)
2. 钱包（开发用）+ [Monad faucet](https://faucet.monad.xyz) 的 MON + [Circle faucet](https://faucet.circle.com) 的 Monad Testnet USDC
3. 可选：LLM Key、Telegram Bot Token（`@BotFather`）
4. 安装并启动：

```bash
cd monad_2026_08_15
cp .env.example .env
# 填 PAY_TO_ADDRESS；阶段 2 保持 SKIP_X402=true
pnpm install
pnpm dev
```

- 前端 http://localhost:3000
- API http://localhost:4000
- Agent Card http://localhost:4000/.well-known/agent-card.json

## 阶段 1：注册 Agent

Agent Card 由 API 现场生成（名字、能力、HTTP endpoint、收款地址）。可以先把 `PUBLIC_API_URL` 指到已部署的 HTTPS，或用 `--onchain` 把 JSON 打成 `data:` URI 上链。

```bash
# .env 里填 PRIVATE_KEY、PAY_TO_ADDRESS、AGENT_URI
pnpm register
# 或完全上链元数据：
pnpm --filter @pulse/api exec tsx src/register.ts --onchain
```

把打印出的 `agentId` 写回 `.env` 的 `AGENT_ID` 和 `NEXT_PUBLIC_AGENT_ID`。到 8004scan 搜 Pulse / 该 ID。

**测试网 Registry**

- Identity `0x8004A818BFB912233c491871b3d84c89A494BD9e`
- Reputation `0x8004B663056A597Dffe9eCcC1965A193B7388713`

**主网 Registry**（`MONAD_NETWORK=mainnet`）

- Identity `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`
- Reputation `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`

## 阶段 2：核心能力（先不接支付）

```bash
curl -s http://localhost:4000/events | jq '.events[0].id'
curl -s -X POST http://localhost:4000/scan \
  -H 'content-type: application/json' \
  -d '{"eventId":"demo-btc-150k"}' | jq '.report.headline'
```

`POST /subscribe`：`wallet`、`eventId`、`email` / `chatId`（渠道选填，可只填一个）。每个事件一律 $0.01。不设阈值——Worker 对每个事件只跑一次，再按人推邮箱或 Telegram。

订阅和通知落 MySQL（默认 `mysql://root@127.0.0.1:3306/pulse`）。刷新、重启都还在。首次启动会把旧的 `apps/.data/events/*.json` 迁进去。

订阅成功后立刻扫该事件并通知。之后 Worker 按 `WATCH_INTERVAL_MINUTES`（默认 5）再检。命中波动会查新闻、社交和成交，用 DeepSeek 写明为什么涨或跌。API 控制台会逐步打印取证和通知。结果页「检查波动」会立刻跑一轮。

## 阶段 3：x402

`.env`：

```
SKIP_X402=false
PAY_TO_ADDRESS=0x你的收款地址
FACILITATOR_URL=https://x402-facilitator.molandak.org
```

前端连钱包 → 签 EIP-3009（gas 由 facilitator 出）→ 自动带支付头重试 `/subscribe`。`/scan` 个人报告不收费。

| 网络 | CAIP-2 | USDC | EIP-712 name |
| --- | --- | --- | --- |
| Testnet | `eip155:10143` | `0x534b2f3A21130d7a60830c2Df862319e593943A3` | `USDC` / `2` |
| Mainnet | `eip155:143` | `0x754704Bc059F8C67012fEd69BC8A327a5aafb603` | `USD Coin` / `2` |

## 阶段 4：声誉

结果页「Useful / Inaccurate」调 `ReputationRegistry.giveFeedback`。黑客松来不及上真交易时，没填 `AGENT_ID` 会停在 UI 提示，口述即可。

## 阶段 5：三屏

1. `/` Agent 介绍 + 8004scan 链接
2. `/scan` 选事件：免费出报告，或付 $0.01 盯盘
3. `/alerts` 报告 / 通知历史（原因 + 可选 tx）+ 反馈

## 阶段 6：部署

- **API + Worker**：Railway / Render / VPS，环境变量切 `MONAD_NETWORK` 与 `PUBLIC_API_URL`（必须 HTTPS，8004scan 才打得开 card）
- **Web**：Vercel，`NEXT_PUBLIC_API_URL` 指到 API
- Demo 60–90s：注册 → 免费出报告 → 付 $0.01 盯盘/推送 →（可选）反馈

## 为何是 Monad 而不是别的 L2

x402 要的是「每调用一笔、立刻最终、费用可忽略」。Monad 并行执行 + 单槽最终性让 agent 对 agent 的小额 USDC 能当 HTTP 状态码用，而不是当一笔要等确认的转账。ERC-8004 的 Identity / Reputation 已在测试网和主网同地址族部署，发现和付款在同一条链上完成。

## 环境变量

见 `.env.example`。最少要填 `PAY_TO_ADDRESS`。阶段 3 再填 `PRIVATE_KEY`（仅注册脚本需要）并关掉 `SKIP_X402`。
