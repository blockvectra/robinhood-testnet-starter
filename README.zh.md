# Robinhood Chain 测试网入门模板（TypeScript + viem）

用 [BlockVectra](https://blockvectra.com/?ref=gh-robinhood-testnet-starter) 在 Robinhood Chain 测试网（链 ID 46630）上开发，再切换到主网的三步模板。

指南：[Robinhood Chain on BlockVectra](https://docs.blockvectra.com/en/guides/robinhood-chain/?ref=gh-robinhood-testnet-starter)

## 准备

```bash
npm install
npm run typecheck
```

需要 Node.js 18 及以上。变量请在 shell 里 export（不会自动加载 `.env`）。

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

运行这一步会为该钱包创建真实账户。如设置 `WALLET_PRIVATE_KEY`，只从本地环境变量读取，切勿提交到仓库；不设置则在内存里生成一次性钱包，运行结束即丢弃，想再次登录同一账户请设置 `WALLET_PRIVATE_KEY`。`.env` 与钱包文件已写入 `.gitignore`。

## 第 3 步：切到主网

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
