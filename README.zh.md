# Robinhood Chain 测试网入门模板（TypeScript + viem）

用 [BlockVectra](https://blockvectra.com/?ref=gh-robinhood-testnet-starter) 在 Robinhood Chain 测试网（链 ID 46630）上开发，再切换到主网的三步模板。

指南：[Robinhood Chain 测试网入门指南](https://docs.blockvectra.com/zh/guides/robinhood-testnet-starter/?ref=gh-robinhood-testnet-starter)

## 选择任务

[供 Agent 读取的任务表（JSON）](agent-tasks.json) · [带日期的内部 QA 示例](verified-walkthrough.example.json)

| 任务 | 入口 | 凭据与副作用 |
|---|---|---|
| 免 key 测试网 RPC | `npm run step1` | 不需账户或 key；先确认网络，再读取区块和余额。 |
| 测试网到主网连续流程 | `npm run walkthrough` | 复用已有 key，或用本地保存的登录钱包签名并创建不会自动撤销的真实 key；钱包首次登录才开户。 |
| 主网 RPC 与索引活动数据 | `npm run step3` | 需要 `BLOCKVECTRA_API_KEY`；读取链上活动数据，不是股票行情。 |
| 测试 ETH | [Faucet 指南](https://docs.blockvectra.com/zh/guides/robinhood-testnet-faucet/?ref=gh-robinhood-testnet-starter) | 仅指南：本仓库不会提交领取请求。 |

## 准备

```bash
npm install
npm run typecheck
npm test
```

需要 Node.js 18 及以上。`npm test` 运行离线钱包测试，不会访问网络。变量请在 shell 里 export（不会自动加载 `.env`）。

## 一条命令：免 key 读取、领 key、带过滤的日志订阅、主网读取

```bash
npm run walkthrough
```

先运行第 1 步（免 key 读测试网），仅在成功后才运行带 `--then-mainnet` 的第 2 步。第 2 步用登录钱包领 key，订阅带过滤的 `logs` 30 秒，然后用同一个 key（只保存在该进程内存中）执行第 3 步的主网读取。无需复制 API key：输出里只显示打码后的 key，API key 不会写入磁盘、命令行参数或 `.env`；登录钱包的保存与复用见下文。任一阶段失败，命令都以非 0 退出：logs 订阅无法建立（永久错误、RPC 错误，或有限次初始尝试后仍未收到确认）或在 30 秒窗口内报错，第 2 步以 1 退出且不再执行主网读取；主网读取失败同样以 1 退出。错误信息输出时 key 会被替换为 `[REDACTED]`。30 秒内没有匹配事件且没有报错不代表失败；成功运行也不代表看到了生产环境的实时数据。

已有 key？若环境中已设置 `BLOCKVECTRA_API_KEY`，walkthrough 会复用该 key、跳过开户（不会创建账户），并用它执行同样的 logs 与主网阶段。这条路径不会读取或创建钱包文件。

未设置 key 时的副作用：第 2 步会在请求 SIWE challenge 之前确定一个登录身份。若设置了 `WALLET_PRIVATE_KEY`，则显式 key 优先，`.agent-wallet.json` 既不读取也不修改。否则首次运行会生成专用登录钱包，并以明文 JSON 保存到当前目录的 `.agent-wallet.json`（权限 `0600`，被 `*wallet*.json` 忽略）；之后在同一目录重跑会复用同一钱包和账户。该文件以明文保存私钥：请备份并妥善保护，不要提交，也不要把私钥作为命令行参数传入。请使用专用钱包，不要使用持有资产或在别处使用的钱包。复用账户并不复用 API key：未设置 `BLOCKVECTRA_API_KEY` 时每次运行仍会新建服务器端 key，且本模板不会自动撤销。钱包读取、格式、权限或写入错误会让第 2 步在 SIWE challenge 之前停止；但 `npm run walkthrough` 仍会先执行第 1 步的公开 HTTP 读取。如需监听真实合约，请先修改 `src/step2-key-and-logs.ts` 中的示例 `address`。

下面的分步命令仍可单独使用。

## 第 1 步：免 key 读测试网

```bash
npm run step1            # 或：npm run step1 -- 0x你的地址
```

用 viem 连公开端点 `https://api.blockvectra.com/v1/robinhood_testnet/public`，读取 `eth_chainId`（`0xb626`）、最新区块号和某地址余额，无需账户。

第 1 步会先对照实时目录（`GET /v1/chains`）确认链 ID，通过后才读取区块和余额。目录中的 `chain_id` 无效，或与 `eth_chainId` 不一致时，第 1 步以非 0 退出，`npm run walkthrough` 不会继续进入开户/领 key 阶段。该保护只适用于本模板的第 1 步及其 walkthrough 入口，并非每个 RPC 或 MCP 请求都有。

## 第 2 步：程序化开户拿 key，用 WebSocket 订阅 logs

```bash
npm run step2
```

- 用钱包签名（SIWE，EIP-191）登录 `console-api.blockvectra.com`，首次登录自动开户，然后创建 API key。开户请求带可选来源字段 `ref: "gh-robinhood-testnet-starter"`。
- 连接 `wss://api.blockvectra.com/v1/robinhood_testnet/{api_key}` 订阅 `logs`；是否支持 WebSocket 及可订阅类型从 `GET https://api.blockvectra.com/v1/chains` 读取。
- 建立订阅有时间上限：最多尝试 3 次，每次建立 WebSocket 连接并等到服务器对 `eth_subscribe` 的确认，限时 8 秒，尝试之间分别暂停 1 秒和 2 秒（总计最多约 27 秒）。握手报错或连接被关闭、或连接已打开但没有收到确认，会复用同一个内存中的 key 重试（不会重新开户或创建 key）；这类失败尝试的连接都会被关闭，并关闭 viem 自带的后台重连。RPC 错误回复（鉴权、策略、参数错误）不会重试。HTTP 4xx 握手拒绝只有在客户端能拿到状态码时才不重试；部分运行环境（例如 Node 原生 WebSocket）只给出不带状态码的错误事件，这种情况和其他初始失败一样，在同样的有限次数内处理。如果 8 秒到期时握手仍未完成，第 2 步会立即以 1 退出而不再重试，因为这个未完成的连接无法通过 viem 的公开 API 取消（之后才打开的 socket 会在打开时被关闭）；所以部分失败会早于 27 秒结束。只连上但没有确认不算成功。
- 30 秒监听窗口在服务器确认订阅之后才开始计时。确认之后出现的任何订阅或连接错误，第 2 步都会立即以 1 退出（不重试，也不当作成功），因此不会执行主网读取。窗口结束时第 2 步会等待 `eth_unsubscribe` 的回复（最多 5 秒）；只有 result 严格等于 `true` 的回复才算成功，没有回复、返回错误、`false`、`null` 或其他格式异常的回复都以 1 退出。
- 这只能恢复订阅建立之前的临时失败。恢复行为已在隔离故障夹具中验证；下方带日期的真实服务 QA 示例是首次连接成功的运行。
- 已有 key：`export BLOCKVECTRA_API_KEY=...` 即跳过开户，也不会读取或创建钱包文件。
- `npm run step2 -- --then-mainnet` 会在 30 秒窗口结束后，用同一个内存中的 key 继续执行主网读取（`npm run walkthrough` 即使用此方式）。单独运行 `npm run step2` 在窗口结束后退出，该进程不再提供新建 key 的 secret，但不会自动撤销服务器端 key。

每个 `logs` 订阅必须包含 `address` 或 `topic0`；空过滤器会返回 `-32602 logs_filter_required`。运行第2步前，请将 `src/step2-key-and-logs.ts` 中的示例 `address` 改为要监听的合约地址。30秒监听期间没有匹配事件，并不代表连接失败。参见 [WebSocket 订阅指南](https://docs.blockvectra.com/zh/guides/websocket-subscriptions/)。

未设置 `BLOCKVECTRA_API_KEY` 时，这一步会在 SIWE challenge 之前确定登录身份，然后创建 API key；只有该钱包首次登录才创建账户。若设置 `WALLET_PRIVATE_KEY`，它优先，钱包文件不会被读取或修改。否则首次运行会创建 `.agent-wallet.json`（明文私钥，权限 `0600`，已被 `*wallet*.json` 忽略），之后在同一目录重跑会复用它，因此继续登录同一账户。保存身份不等于复用 API key：每次未带 key 的运行仍会新建服务器端 key，且不会自动撤销。已有 `BLOCKVECTRA_API_KEY` 时完全跳过钱包，不会读取或创建该文件。切勿把私钥作为命令行参数传入或提交到仓库；请备份并保护钱包文件。`.env` 与 `*wallet*.json` 已写入 `.gitignore`。

## 第 3 步：切到主网

第 3 步是独立进程，只读取 `BLOCKVECTRA_API_KEY`。第 2 步会对新建的 key 打码且不保存，所以请使用已有的 key（例如在控制台创建的），或用 `npm run walkthrough` 在同一进程内交接 key。

```bash
export BLOCKVECTRA_API_KEY=...
npm run step3
```

把链名 `robinhood_testnet` 换成 `robinhood_mainnet`，同一个 key 即可使用。主网上还可以调用 Robinhood 股票代币的 Data API：

```bash
curl -H "x-api-key: $BLOCKVECTRA_API_KEY" https://api.blockvectra.com/v1/data/robinhood_mainnet/stocks
```

测试网没有 Data API（`/v1/chains` 中 `robinhood_testnet` 的 `data` 为 `false`）。限额、支持的方法与价格会变化，请以 `/v1/chains`、`/v1/plans` 与[文档](https://docs.blockvectra.com/en/guides/robinhood-chain/?ref=gh-robinhood-testnet-starter)为准。

## 带日期的内部 QA 示例

2026-10-16 使用全新专用 QA 钱包，在[版本 `f350d8b1`](https://github.com/blockvectra/robinhood-testnet-starter/commit/f350d8b120c7fa52dc7fa46a95fc5318d5b948b5)真实运行 `npm run walkthrough`：收到订阅与取消订阅确认，然后用同一个内存中的 key 完成主网读取，以 0 退出。[脱敏回执](verified-walkthrough.example.json)列明了本次验证范围和限制。

命令结束后，QA 工具另外撤销了它创建的 key，并验证预期的 401；这不是模板自带的自动清理。窗口内没有匹配的合约日志；该示例不保证事件送达、实时行情、外部采用或持续可用性。

该次运行早于 `.agent-wallet.json` 复用功能。它只是 walkthrough 的历史证据，不是新钱包行为的真实服务实测；新钱包路径仅由离线测试覆盖。

## 许可证

MIT
