import { expect } from "chai";
import { network } from "hardhat"

const { ethers } = await network.create();

describe("PriceOracle", function () {
    const FEED_DECIMALS = 8;
    const FEED_INITIAL_ANSWER = 3000n * 10n ** BigInt(FEED_DECIMALS);

    async function deployFixture() {
        const mockFeed = await ethers.deployContract("MockV3Aggregator", [FEED_DECIMALS, FEED_INITIAL_ANSWER]);
        const priceOracle = await ethers.deployContract("PriceOracle", [await mockFeed.getAddress()]);
        return { mockFeed, priceOracle };
    }

    describe("Deployment", function () {
        it("be sure usd feed is set correctly", async function () {
            const { mockFeed, priceOracle } = await deployFixture();
            expect(await priceOracle.ethUsdFeed()).to.equal(await mockFeed.getAddress());
        });

        it("price feed can not be invaild address", async function () {
            await expect(
                ethers.deployContract("PriceOracle", [ethers.ZeroAddress]),
            ).to.be.revertedWith("Invalid address");
        });
    });

    describe("getEthUsdPrice", function () {
        it("应该返回 ETH/USD 原始价格", async function () {
            const { priceOracle } = await deployFixture();

            expect(await priceOracle.getEthUsdPrice()).to.equal(FEED_INITIAL_ANSWER);
        });

        it("价格更新后应该返回新价格", async function () {
            const { mockFeed, priceOracle } = await deployFixture();
            const newPrice = 3500n * 10n ** 8n;

            await mockFeed.updateAnswer(newPrice);

            expect(await priceOracle.getEthUsdPrice()).to.equal(newPrice);
        });

        it("价格为零时应该回退", async function () {
            const { mockFeed, priceOracle } = await deployFixture();

            await mockFeed.updateAnswer(0);

            await expect(priceOracle.getEthUsdPrice()).to.be.revertedWith(
                "Invalid Price",
            );
        });
    });

    describe("convertEthToUsd", function () {
        it("应该将 1 ETH 转换为美元价值", async function () {
            const { priceOracle } = await deployFixture();
            const oneEth = ethers.parseEther("1");

            const usdValue = await priceOracle.convertEthToUsd(oneEth);

            expect(usdValue).to.equal(ethers.parseUnits("3000", 18));
        });

        it("应该将 0.5 ETH 转换为美元价值", async function () {
            const { priceOracle } = await deployFixture();
            const halfEth = ethers.parseEther("0.5");

            const usdValue = await priceOracle.convertEthToUsd(halfEth);

            expect(usdValue).to.equal(ethers.parseUnits("1500", 18));
        });
    });

});