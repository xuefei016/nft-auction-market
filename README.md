# NFT Auction Market

[中文文档](README.zh-CN.md)

An ETH NFT auction market built with Hardhat 3, Solidity, Chainlink Data Feeds, and OpenZeppelin UUPS.

The project supports ERC-721 minting and auctions, ETH bidding, USD price conversion, outbid refunds, seller withdrawals, and upgrading the market contract through a UUPS proxy. The current version accepts ETH bids only and does not support ERC-20 payments.

Repository: [https://github.com/xuefei016/nft-auction-market](https://github.com/xuefei016/nft-auction-market)

```bash
git clone https://github.com/xuefei016/nft-auction-market
```

## Features

- Mint and transfer ERC-721 NFTs.
- NFT owners create time-limited auctions and transfer the NFT into market custody.
- Bidders place bids in ETH. The first bid must be at least the starting price, and later bids must be strictly higher.
- The seller cannot bid on their own auction.
- Outbid users withdraw refunds themselves through a pull-payment pattern.
- After an auction ends, the NFT is transferred to the highest bidder and the proceeds are credited to the seller's pending withdrawal balance.
- If there are no bids, the NFT is returned to the seller.
- Starting prices and highest bids can be converted to USD in real time with a Chainlink ETH/USD feed.
- The market address stays the same across upgrades through a UUPS proxy.

USD values are for display only. The winning bid is always decided by the ETH amount.

## Contract overview

| Contract | Description |
|---|---|
| `AuctionNFT.sol` | ERC-721 test NFT (`AuctionNFT` / `ANFT`) with a public `mint(address)` function |
| `AuctionMarket.sol` | Auction market V1: custody, bidding, settlement, withdrawals, USD helpers, and UUPS upgrade authorization |
| `AuctionMarketV2.sol` | V2 implementation that inherits V1 and adds `version()` for upgrade verification |
| `PriceOracle.sol` | Reads a Chainlink ETH/USD feed and converts ETH amounts to USD |
| `interface/IPriceOracle.sol` | Price oracle interface used by the market |
| `mock/MockV3Aggregator.sol` | Thin wrapper around Chainlink's mock aggregator for tests |

The `Counter` contracts, `test/Counter.ts`, `ignition/modules/Counter.ts`, and `scripts/send-op-tx.ts` are leftover Hardhat template samples and are not part of the NFT auction flow.

## Project structure

```text
contracts/
├── AuctionNFT.sol                    # ERC-721 test NFT
├── AuctionMarket.sol                 # Auction market V1 and UUPS upgrade logic
├── AuctionMarketV2.sol               # Upgrade verification version that adds version()
├── PriceOracle.sol                   # Chainlink ETH/USD price reads and conversion
├── interface/IPriceOracle.sol        # Price oracle interface
└── mock/MockV3Aggregator.sol         # Chainlink feed mock used in tests

scripts/
├── deploy.ts                         # Sepolia deployment script
└── upgrade.ts                        # UUPS V2 upgrade script

test/
├── AuctionMarket.ts                  # Auction, oracle integration, and upgrade tests
└── PriceOracle.ts                    # Chainlink price and decimal conversion tests
```

## Auction flow

1. A user calls `AuctionNFT.mint()` to mint an NFT.
2. The NFT owner approves `AuctionMarket` to transfer the NFT.
3. The owner calls `createAuction()`, and the NFT is transferred into market custody.
4. Bidders call `bid()` and send ETH.
5. When a new highest bid is placed, the previous bid is credited to the earlier bidder's `pendingWithdrawals`.
6. After the auction expires, anyone can call `endAuction()` to settle it.
7. Sellers and outbid users call `withdraw()` to pull funds.

`bid()` always ranks bids by ETH amount. USD values are for display only and do not decide the winner.

## Chainlink price conversion

`PriceOracle` reads the ETH/USD price through `AggregatorV3Interface.latestRoundData()` and checks that:

- The returned price is greater than 0.
- `updatedAt` is greater than 0.
- The update time is not later than the current block time.

Chainlink ETH/USD feeds typically use 8 decimals, while ETH amounts use 18 decimals:

```text
usdValue = ethAmount × ethUsdPrice ÷ 10^feedDecimals
```

The converted value uses 18 decimals. For example, when ETH is priced at 3000 USD, `1 ether` corresponds to `3000 × 10^18`.

## UUPS upgrades

`AuctionMarket` inherits:

- `Initializable`
- `OwnableUpgradeable`
- `UUPSUpgradeable`

Initialization runs through the proxy via `initialize(priceOracle)`. The implementation constructor calls `_disableInitializers()` so the implementation cannot be initialized on its own.

Upgrade authorization is restricted to the owner:

```solidity
function _authorizeUpgrade(address) internal override onlyOwner {}
```

V2 inherits V1 and only adds `version()`. After an upgrade, the proxy address, owner, price oracle address, and existing auction data remain unchanged.

## Installation

```bash
git clone https://github.com/xuefei016/nft-auction-market
cd nft-auction-market
npm install
```

Copy the environment template:

```bash
cp .env.example .env
```

Fill in `.env`:

```dotenv
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY
SEPOLIA_PRIVATE_KEY=0xYOUR_PRIVATE_KEY
AUCTION_MARKET_PROXY=0xYOUR_PROXY_ADDRESS
```

`.env` is gitignored. Do not commit real RPC credentials or private keys.

## Compile and test

```bash
npx hardhat compile
npx hardhat test
```

Generate a coverage report:

```bash
npx hardhat --coverage test
```

The HTML report is written to `coverage/html/index.html`.

### Test coverage

The existing project README states that this project includes 23 TypeScript tests covering the auction lifecycle, refunds and withdrawals, Chainlink conversion, live price updates, UUPS upgrades, state retention, and upgrade permissions. The coverage figures below are copied from that README.

| Contract | Statements | Lines |
|---|---:|---:|
| `AuctionMarket.sol` | 98/100 (98%) | 98/100 (98%) |
| `AuctionMarketV2.sol` | 1/1 (100%) | 1/1 (100%) |
| `AuctionNFT.sol` | 3/3 (100%) | 3/3 (100%) |
| `PriceOracle.sol` | 10/10 (100%) | 10/10 (100%) |
| `Counter.sol` | 5/5 (100%) | 5/5 (100%) |
| **Total** | **117/119 (98.31%)** | **117/119 (98.31%)** |

Hardhat currently reports Branches and Functions as `0/0`, so the test report uses Statements and Lines.

## Sepolia deployment

Chainlink Sepolia ETH/USD feed:

```text
0x694AA1769357215DE4FAC081bf1f309aDC325306
```

Deploy with:

```bash
npx hardhat run scripts/deploy.ts --network sepolia
```

The deploy script deploys `PriceOracle`, `AuctionNFT`, and the `AuctionMarket` UUPS proxy in order, then prints the proxy and implementation addresses. It only runs on Sepolia (chain ID 11155111).

### Deployed addresses

| Contract | Sepolia address |
|---|---|
| PriceOracle | [`0x1aa8A498275100857D918377e47e33ae4bC031FB`](https://sepolia.etherscan.io/address/0x1aa8A498275100857D918377e47e33ae4bC031FB) |
| AuctionNFT | [`0x7312BBabACFF52dFF7Fc391843Fc7cd1AAa511d4`](https://sepolia.etherscan.io/address/0x7312BBabACFF52dFF7Fc391843Fc7cd1AAa511d4) |
| AuctionMarket Proxy | [`0x37C1886C52Ff596eaEBE408e3Bc5efa7DD14E776`](https://sepolia.etherscan.io/address/0x37C1886C52Ff596eaEBE408e3Bc5efa7DD14E776) |
| AuctionMarket V1 Implementation | [`0xE0eb5c4584C401593F63666D4Cb19376f8E3269A`](https://sepolia.etherscan.io/address/0xE0eb5c4584C401593F63666D4Cb19376f8E3269A) |
| AuctionMarket V2 Implementation | [`0x9278AF65CfB40b4CeF4C2421Fd7dDeF1Ac293EC8`](https://sepolia.etherscan.io/address/0x9278AF65CfB40b4CeF4C2421Fd7dDeF1Ac293EC8) |

Applications and users should always use the `AuctionMarket Proxy` address. Implementation addresses change when the contract is upgraded.

## Upgrading

Confirm that `AUCTION_MARKET_PROXY` in `.env` is the deployed proxy address, then run:

```bash
npx hardhat run scripts/upgrade.ts --network sepolia
```

The script checks that:

- The current network is Sepolia.
- The proxy address is valid.
- The executing account is the proxy owner.
- The proxy has not already been upgraded to V2.

After a successful upgrade it prints the previous and new implementation addresses and confirms that `version()` returns `2`.

OpenZeppelin's `.openzeppelin/sepolia.json` stores proxy and implementation deployment records. It does not contain private keys and should be kept and committed.

## Security design

- The market contract holds the NFT in custody for the duration of the auction.
- Withdrawals follow the Checks-Effects-Interactions pattern.
- Pull-payment is used so bids do not refund previous bidders in the same transaction.
- The `ended` flag prevents double settlement.
- Only the owner can authorize a UUPS upgrade.
- The implementation contract disables initializers.
- The oracle rejects invalid prices and invalid update timestamps.

## Tech stack

- Solidity 0.8.28
- Hardhat 3
- Ethers.js 6
- OpenZeppelin Contracts 5
- OpenZeppelin Hardhat Upgrades 4
- Chainlink Contracts 1.5
- Mocha + Chai

## License

MIT
