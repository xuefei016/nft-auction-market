import "dotenv/config";
import hre from "hardhat";
import { upgrades } from "@openzeppelin/hardhat-upgrades";

const SEPOLIA_CHAIN_ID = 11155111n;

async function main() {
  const connection = await hre.network.create();
  const { ethers } = connection;
  const upgradesApi = await upgrades(hre, connection);

  const network = await ethers.provider.getNetwork();
  if (network.chainId !== SEPOLIA_CHAIN_ID) {
    throw new Error(
      `This script only supports Sepolia (chain ID ${SEPOLIA_CHAIN_ID}), received ${network.chainId}`,
    );
  }

  const proxyAddress = process.env.AUCTION_MARKET_PROXY;
  if (proxyAddress === undefined || !ethers.isAddress(proxyAddress)) {
    throw new Error("AUCTION_MARKET_PROXY is missing or invalid in .env");
  }

  const [deployer] = await ethers.getSigners();
  const currentMarket = await ethers.getContractAt(
    "AuctionMarket",
    proxyAddress,
  );
  const owner = await currentMarket.owner();

  if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
    throw new Error(
      `Deployer ${deployer.address} is not the proxy owner ${owner}`,
    );
  }

  const marketV2 = await ethers.getContractAt(
    "AuctionMarketV2",
    proxyAddress,
  );
  try {
    const currentVersion = await marketV2.version();
    if (currentVersion === 2n) {
      const currentImplementation =
        await upgradesApi.erc1967.getImplementationAddress(proxyAddress);
      console.log("AuctionMarket is already upgraded to V2");
      console.log("AuctionMarket Proxy:", proxyAddress);
      console.log("Current Implementation:", currentImplementation);
      console.log("Version:", currentVersion.toString());
      return;
    }
  } catch {
    // V1 does not expose version(), so continue with the upgrade.
  }

  const previousImplementation =
    await upgradesApi.erc1967.getImplementationAddress(proxyAddress);

  const AuctionMarketV2 =
    await ethers.getContractFactory("AuctionMarketV2");
  const upgradedMarket = await upgradesApi.upgradeProxy(
    proxyAddress,
    AuctionMarketV2,
    { kind: "uups" },
  );
  const upgradeTransaction = (
    upgradedMarket as typeof upgradedMarket & {
      deployTransaction?: { wait(): Promise<unknown> };
    }
  ).deployTransaction;

  if (upgradeTransaction === undefined) {
    throw new Error("Upgrade transaction was not returned");
  }
  await upgradeTransaction.wait();

  const newImplementation =
    await upgradesApi.erc1967.getImplementationAddress(proxyAddress);

  console.log("AuctionMarket Proxy:", await upgradedMarket.getAddress());
  console.log("Previous Implementation:", previousImplementation);
  console.log("New Implementation:", newImplementation);
  console.log("Version:", (await upgradedMarket.version()).toString());
}

await main();
