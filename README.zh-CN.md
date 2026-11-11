[English](README.md)
# NFT Auction Market

基于 Hardhat 3、Solidity、Chainlink Data Feeds 和 OpenZeppelin UUPS 实现的 ETH NFT 拍卖市场。

项目支持 ERC721 NFT 铸造与拍卖、ETH 出价、美元价格换算、竞拍退款、卖家提款，以及通过 UUPS 代理升级拍卖合约。当前版本仅支持 ETH 出价，不支持 ERC20 支付。

## 功能

- 铸造和转移 ERC721 NFT。
- NFT 所有者创建限时拍卖并将 NFT 托管到市场合约。
- 用户使用 ETH 出价，首次出价不得低于起拍价，后续出价必须更高。
- 被超价用户通过 pull-payment 模式主动提取退款。
- 拍卖结束后将 NFT 转给最高出价者，并将拍卖收入计入卖家待提款余额。
- 无人出价时将 NFT 退回卖家。
- 使用 Chainlink ETH/USD Feed 实时换算起拍价和最高出价。
- 使用 UUPS 代理保持市场地址不变并升级实现合约。

## 合约结构

```text
contracts/
├── AuctionNFT.sol                    # ERC721 测试 NFT
├── AuctionMarket.sol                 # 拍卖市场 V1 与 UUPS 升级逻辑
├── AuctionMarketV2.sol               # 增加 version() 的升级验证版本
├── PriceOracle.sol                   # Chainlink ETH/USD 价格读取与换算
├── interface/IPriceOracle.sol        # 价格预言机接口
└── mock/MockV3Aggregator.sol         # Chainlink Feed 测试包装合约

scripts/
├── deploy.ts                         # Sepolia 部署脚本
└── upgrade.ts                        # UUPS V2 升级脚本

test/
├── AuctionMarket.ts                  # 拍卖、预言机集成和升级测试
└── PriceOracle.ts                    # Chainlink 价格与精度测试
```

仓库中的 `Counter` 文件是 Hardhat 初始化模板示例，不属于 NFT 拍卖业务。

## 拍卖流程

1. 用户调用 `AuctionNFT.mint()` 铸造 NFT。
2. NFT 所有者授权 `AuctionMarket` 操作 NFT。
3. 所有者调用 `createAuction()`，NFT 转入市场合约托管。
4. 竞拍者调用 `bid()` 并发送 ETH。
5. 新的最高出价产生后，旧出价计入原竞拍者的 `pendingWithdrawals`。
6. 拍卖到期后，任何人都可以调用 `endAuction()` 完成结算。
7. 卖家和被超价用户调用 `withdraw()` 提取资金。

`bid()` 始终按照 ETH 数量决定最高出价。美元价值仅用于展示，不参与胜负判断。

## Chainlink 价格换算

`PriceOracle` 通过 `AggregatorV3Interface.latestRoundData()` 读取 ETH/USD 价格，并检查：

- 返回价格必须大于 0。
- `updatedAt` 必须大于 0。
- 更新时间不能晚于当前区块时间。

Chainlink ETH/USD Feed 通常使用 8 位精度，ETH 金额使用 18 位精度：

```text
usdValue = ethAmount × ethUsdPrice ÷ 10^feedDecimals
```

换算结果使用 18 位精度。例如 ETH 价格为 3000 USD 时，`1 ether` 对应 `3000 × 10^18`。

## UUPS 升级

`AuctionMarket` 继承：

- `Initializable`
- `OwnableUpgradeable`
- `UUPSUpgradeable`

初始化通过代理调用 `initialize(priceOracle)` 完成。实现合约构造函数调用 `_disableInitializers()`，防止实现合约被单独初始化。

升级权限由以下函数限制为 owner：

```solidity
function _authorizeUpgrade(address) internal override onlyOwner {}
```

V2 继承 V1，仅增加 `version()`。升级后代理地址、owner、价格预言机地址和已有拍卖数据均保持不变。

## 安装

```bash
npm install
```

复制环境变量模板：

```bash
cp .env.example .env
```

填写 `.env`：

```dotenv
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY
SEPOLIA_PRIVATE_KEY=0xYOUR_PRIVATE_KEY
AUCTION_MARKET_PROXY=0xYOUR_PROXY_ADDRESS
```

`.env` 已被 Git 忽略，请勿提交真实 RPC 凭证或私钥。

## 编译与测试

```bash
npx hardhat compile
npx hardhat test
```

生成覆盖率报告：

```bash
npx hardhat --coverage test
```

HTML 报告生成在 `coverage/html/index.html`。

### 测试覆盖率

本项目包含 23 个 TypeScript 测试，覆盖拍卖生命周期、退款和提款、Chainlink 换算、实时价格更新、UUPS 升级、状态保留和升级权限。

| 合约 | Statements | Lines |
|---|---:|---:|
| `AuctionMarket.sol` | 98/100 (98%) | 98/100 (98%) |
| `AuctionMarketV2.sol` | 1/1 (100%) | 1/1 (100%) |
| `AuctionNFT.sol` | 3/3 (100%) | 3/3 (100%) |
| `PriceOracle.sol` | 10/10 (100%) | 10/10 (100%) |
| `Counter.sol` | 5/5 (100%) | 5/5 (100%) |
| **总计** | **117/119 (98.31%)** | **117/119 (98.31%)** |

Hardhat 当前报告中的 Branches 和 Functions 为 `0/0`，因此测试报告以 Statements 和 Lines 为准。

## Sepolia 部署

Chainlink Sepolia ETH/USD Feed：

```text
0x694AA1769357215DE4FAC081bf1f309aDC325306
```

执行部署：

```bash
npx hardhat run scripts/deploy.ts --network sepolia
```

部署脚本会依次部署 `PriceOracle`、`AuctionNFT` 和 `AuctionMarket` UUPS 代理，并输出代理与实现合约地址。

### 已部署地址

| 合约 | Sepolia 地址 |
|---|---|
| PriceOracle | [`0x1aa8A498275100857D918377e47e33ae4bC031FB`](https://sepolia.etherscan.io/address/0x1aa8A498275100857D918377e47e33ae4bC031FB) |
| AuctionNFT | [`0x7312BBabACFF52dFF7Fc391843Fc7cd1AAa511d4`](https://sepolia.etherscan.io/address/0x7312BBabACFF52dFF7Fc391843Fc7cd1AAa511d4) |
| AuctionMarket Proxy | [`0x37C1886C52Ff596eaEBE408e3Bc5efa7DD14E776`](https://sepolia.etherscan.io/address/0x37C1886C52Ff596eaEBE408e3Bc5efa7DD14E776) |
| AuctionMarket V1 Implementation | [`0xE0eb5c4584C401593F63666D4Cb19376f8E3269A`](https://sepolia.etherscan.io/address/0xE0eb5c4584C401593F63666D4Cb19376f8E3269A) |
| AuctionMarket V2 Implementation | [`0x9278AF65CfB40b4CeF4C2421Fd7dDeF1Ac293EC8`](https://sepolia.etherscan.io/address/0x9278AF65CfB40b4CeF4C2421Fd7dDeF1Ac293EC8) |

应用和用户应始终使用 `AuctionMarket Proxy` 地址。实现地址会随着升级变化。

## 执行升级

确认 `.env` 中的 `AUCTION_MARKET_PROXY` 是已部署的代理地址，然后运行：

```bash
npx hardhat run scripts/upgrade.ts --network sepolia
```

脚本会检查：

- 当前网络是 Sepolia。
- 代理地址有效。
- 执行账户是代理 owner。
- 代理是否已经升级到 V2。

升级完成后会输出升级前后实现地址，并确认 `version()` 返回 `2`。

OpenZeppelin 的 `.openzeppelin/sepolia.json` 保存代理和实现合约部署记录，不包含私钥，应保留并提交。

## 安全设计

- NFT 在拍卖期间由市场合约托管。
- 采用 Checks-Effects-Interactions 顺序处理提款。
- 使用 pull-payment，避免在出价过程中直接向旧竞拍者退款。
- `ended` 标记防止重复结算。
- UUPS 升级仅允许 owner 执行。
- 实现合约禁用初始化器。
- 预言机拒绝无效价格和无效更新时间。

## 技术栈

- Solidity 0.8.28
- Hardhat 3
- Ethers.js 6
- OpenZeppelin Contracts 5
- OpenZeppelin Hardhat Upgrades 4
- Chainlink Contracts 1.5
- Mocha + Chai
