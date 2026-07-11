import hre from "hardhat";
import { upgrades } from "@openzeppelin/hardhat-upgrades";

const SEPOLIA_CHAIN_ID = 11155111n;
const SEPOLIA_ETH_USD_FEED =
  "0x694AA1769357215DE4FAC081bf1f309aDC325306";

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

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const priceOracle = await ethers.deployContract("PriceOracle", [
    SEPOLIA_ETH_USD_FEED,
  ]);
  await priceOracle.waitForDeployment();

  const nft = await ethers.deployContract("AuctionNFT");
  await nft.waitForDeployment();

  const AuctionMarket = await ethers.getContractFactory("AuctionMarket");
  const auctionMarket = await upgradesApi.deployProxy(
    AuctionMarket,
    [await priceOracle.getAddress()],
    {
      initializer: "initialize",
      kind: "uups",
    },
  );
  await auctionMarket.waitForDeployment();

  const proxyAddress = await auctionMarket.getAddress();
  const implementationAddress =
    await upgradesApi.erc1967.getImplementationAddress(proxyAddress);

  console.log("PriceOracle:", await priceOracle.getAddress());
  console.log("AuctionNFT:", await nft.getAddress());
  console.log("AuctionMarket Proxy:", proxyAddress);
  console.log("AuctionMarket Implementation:", implementationAddress);
}

await main();
