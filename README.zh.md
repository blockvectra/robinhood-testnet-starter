# Robinhood Chain 测试网入门模板（TypeScript + viem）

用 [BlockVectra](https://blockvectra.com/?ref=gh-robinhood-testnet-starter) 在 Robinhood Chain 测试网（链 ID 46630）上开发，再切换到主网的三步模板。

指南：[Robinhood Chain 测试网入门指南](https://docs.blockvectra.com/zh/guides/robinhood-testnet-starter/?ref=gh-robinhood-testnet-starter)

## 准备

```bash
npm install
npm run typecheck
```

需要 Node.js 18 及以上。变量请在 shell 里 export（不会自动加载 `.env`）。

## 一条命令：免 key 读取、领 key、带过滤的日志订阅、主网读取

```bash
npm run walkthrough
```

先运行第 1 步（免 key 读测试网），仅在成功后才运行带 `--then-mainnet` 的第 2 步。第 2 步开户领 key，订阅带过滤的 `logs` 30 秒，然后用同一个 key（只保存在该进程内存中）执行第 3 步的主网读取。无需复制 key：输出里只显示打码后的 key，不会写入磁盘、命令行参数或 `.env`。任一阶段失败，命令都以非 0 退出：30 秒窗口内 logs 订阅若报错，第 2 步以 1 退出且不再执行主网读取；主网读取失败同样以 1 退出。错误信息输出时 key 会被替换为 `[REDACTED]`。30 秒内没有匹配事件且没有报错不代表失败；成功运行也不代表看到了生产环境的实时数据。

已有 key？若环境中已设置 `BLOCKVECTRA_API_KEY`，walkthrough 会复用该 key、跳过开户（不会创建账户），并用它执行同样的 logs 与主网阶段。

未设置 key 时的副作用：未设置 `WALLET_PRIVATE_KEY` 时，会用新生成的一次性钱包登录，每次运行都会创建真实账户和真实 API key；进程结束后钱包和 key 即被丢弃，重复运行会不断创建新账户。不要把 `WALLET_PRIVATE_KEY` 设为持有资产或在别处使用的钱包，请只用一次性钱包。如需监听真实合约，请先修改 `src/step2-key-and-logs.ts` 中的示例 `address`。

下面的分步命令仍可单独使用。

## 第 1 步：免 key 读测试网

```bash
npm run step1            # 或：npm run step1 -- 0x你的地址
```

用 viem 连公开端点 `https://api.blockvectra.com/v1/robinhood_testnet/public`，读取 `eth_chainId`（`0xb626`）、最新区块号和某地址余额，无需账户。

## 第 2 步：程序化开户拿 key，用 WebSocket 订阅 logs

```bash
npm run step2
```

- 用钱包签名（SIWE，EIP-191）登录 `console-api.blockvectra.com`，首次登录自动开户，然后创建 API key。开户请求带可选来源字段 `ref: "gh-robinhood-testnet-starter"`。
- 连接 `wss://api.blockvectra.com/v1/robinhood_testnet/{api_key}` 订阅 `logs`；是否支持 WebSocket 及可订阅类型从 `GET https://api.blockvectra.com/v1/chains` 读取。
- 已有 key：`export BLOCKVECTRA_API_KEY=...` 即跳过开户。
- `npm run step2 -- --then-mainnet` 会在 30 秒窗口结束后，用同一个内存中的 key 继续执行主网读取（`npm run walkthrough` 即使用此方式）。单独运行 `npm run step2` 在窗口结束后退出，生成的 key 随进程消失。

每个 `logs` 订阅必须包含 `address` 或 `topic0`；空过滤器会返回 `-32602 logs_filter_required`。运行第2步前，请将 `src/step2-key-and-logs.ts` 中的示例 `address` 改为要监听的合约地址。30秒监听期间没有匹配事件，并不代表连接失败。参见 [WebSocket 订阅指南](https://docs.blockvectra.com/zh/guides/websocket-subscriptions/)。

运行这一步会为该钱包创建真实账户。如设置 `WALLET_PRIVATE_KEY`，只从本地环境变量读取，切勿提交到仓库；不设置则在内存里生成一次性钱包，运行结束即丢弃，想再次登录同一账户请设置 `WALLET_PRIVATE_KEY`。`.env` 与钱包文件已写入 `.gitignore`。

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

## 许可证

MIT
