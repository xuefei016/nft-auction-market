import { expect } from "chai";
import { network } from "hardhat"

const { ethers, networkHelpers } = await network.connect();

const FEED_DECIMALS = 8;
const FEED_INITIAL_ANSWER = 3000n * 10n ** BigInt(FEED_DECIMALS);

describe("AuctionMarket", function () {
    async function deployFixture() {
        const [seller, bidder, bidder2] = await ethers.getSigners();

        const mockFeed = await ethers.deployContract("MockV3Aggregator", [FEED_DECIMALS, FEED_INITIAL_ANSWER]);
        const priceOracle = await ethers.deployContract("PriceOracle", [await mockFeed.getAddress()]);

        const auctionMarket = await ethers.deployContract("AuctionMarket", [await priceOracle.getAddress()]);
        const nft = await ethers.deployContract("AuctionNFT", []);
        return { seller, bidder, bidder2, mockFeed, priceOracle, auctionMarket, nft };
    }

    async function createAuctionFixture() {
        const tokenId = 0n;
        const startPrice = ethers.parseEther("1");
        const duration = 3600;
        const auctionId = 0n;
        const { seller, bidder, bidder2, mockFeed, priceOracle, auctionMarket, nft } = await deployFixture();
        const nftAsSeller = nft.connect(seller) as typeof nft;
        const auctionMarketAsSeller = auctionMarket.connect(seller) as typeof auctionMarket;
        await nftAsSeller.mint(seller.address);
        await nftAsSeller.approve(await auctionMarket.getAddress(), tokenId);
        const createAuctionTx = await auctionMarketAsSeller.createAuction(
            await nft.getAddress(),
            tokenId,
            startPrice,
            duration,
        );
        return {
            seller,
            bidder,
            bidder2,
            mockFeed,
            priceOracle,
            auctionMarket,
            nft,
            auctionId,
            tokenId,
            startPrice,
            duration,
            createAuctionTx,
        };
    }

    it("should reject an invalid price oracle address", async function () {
        await expect(
            ethers.deployContract("AuctionMarket", [ethers.ZeroAddress]),
        ).to.be.revertedWith("Invalid price oracle address");
    });

    it("should store the price oracle address", async function () {
        const { priceOracle, auctionMarket } = await deployFixture();

        expect(await auctionMarket.priceOracle()).to.equal(
            await priceOracle.getAddress(),
        );
    });

    it("should convert start price to USD", async function () {
        const { auctionMarket, auctionId } = await createAuctionFixture();
        const startPriceUsd = await auctionMarket.getStartPriceUsd(auctionId);
        expect(startPriceUsd).to.equal(ethers.parseUnits("3000", 18));
    });

    it("should return zero before any bid", async function () {
        const { auctionMarket, auctionId } = await createAuctionFixture();
        const highestBidUsd = await auctionMarket.getHighestBidUsd(auctionId);
        expect(highestBidUsd).to.equal(0n);
    });

    it("should convert highest bid to USD", async function () {
        const { auctionMarket, auctionId, bidder } = await createAuctionFixture();
        const auctionMarketAsBidder = auctionMarket.connect(bidder) as typeof auctionMarket;
        const bidAmount = ethers.parseEther("1.5");
        await auctionMarketAsBidder.bid(auctionId, { value: bidAmount });
        const highestBidUsd = await auctionMarket.getHighestBidUsd(auctionId);
        expect(highestBidUsd).to.equal(ethers.parseUnits("4500", 18));
    });

    it("should use the latest feed price for the highest bid", async function () {
        const { auctionMarket, auctionId, bidder, mockFeed } = await createAuctionFixture();
        const auctionMarketAsBidder = auctionMarket.connect(bidder) as typeof auctionMarket;
        const bidAmount = ethers.parseEther("1.5");
        const updatedPrice = 3500n * 10n ** BigInt(FEED_DECIMALS);

        await auctionMarketAsBidder.bid(auctionId, { value: bidAmount });
        await mockFeed.updateAnswer(updatedPrice);

        expect(await auctionMarket.getHighestBidUsd(auctionId)).to.equal(
            ethers.parseUnits("5250", 18),
        );
    });

    it("should reject USD queries for a missing auction", async function () {
        const { auctionMarket } = await deployFixture();
        const missingAuctionId = 999n;

        await expect(
            auctionMarket.getStartPriceUsd(missingAuctionId),
        ).to.be.revertedWith("Auction does not exist");
        await expect(
            auctionMarket.getHighestBidUsd(missingAuctionId),
        ).to.be.revertedWith("Auction does not exist");
    });

    it("should create an auction and transfer the NFT into custody", async function () {
        const {
            seller,
            auctionMarket,
            nft,
            auctionId,
            tokenId,
            startPrice,
            createAuctionTx,
        } = await createAuctionFixture();

        await expect(createAuctionTx)
            .to.emit(auctionMarket, "AuctionCreated")
            .withArgs(
                auctionId,
                seller.address,
                await nft.getAddress(),
                tokenId,
            );
        expect(await nft.ownerOf(tokenId)).to.equal(
            await auctionMarket.getAddress(),
        );

        const auction = await auctionMarket.getAuction(auctionId);
        expect(auction.seller).to.equal(seller.address);
        expect(auction.nft).to.equal(await nft.getAddress());
        expect(auction.tokenId).to.equal(tokenId);
        expect(auction.startPrice).to.equal(startPrice);
    });

    it("should credit the previous bidder after a higher bid", async function () {
        const { auctionMarket, auctionId, bidder, bidder2 } =
            await createAuctionFixture();
        const firstBid = ethers.parseEther("1");
        const secondBid = ethers.parseEther("1.5");

        await (auctionMarket.connect(bidder) as typeof auctionMarket).bid(
            auctionId,
            { value: firstBid },
        );
        await (auctionMarket.connect(bidder2) as typeof auctionMarket).bid(
            auctionId,
            { value: secondBid },
        );

        const auction = await auctionMarket.getAuction(auctionId);
        expect(auction.highestBidder).to.equal(bidder2.address);
        expect(auction.highestBid).to.equal(secondBid);
        expect(await auctionMarket.pendingWithdrawals(bidder.address)).to.equal(
            firstBid,
        );
    });

    it("should end an auction with a winning bid", async function () {
        const {
            seller,
            bidder,
            auctionMarket,
            nft,
            auctionId,
            tokenId,
            duration,
        } = await createAuctionFixture();
        const bidAmount = ethers.parseEther("1.5");

        await (auctionMarket.connect(bidder) as typeof auctionMarket).bid(
            auctionId,
            { value: bidAmount },
        );
        await expect(auctionMarket.endAuction(auctionId)).to.be.revertedWith(
            "Auction has not ended yet",
        );

        await networkHelpers.time.increase(duration);
        await auctionMarket.endAuction(auctionId);

        expect(await nft.ownerOf(tokenId)).to.equal(bidder.address);
        expect(await auctionMarket.pendingWithdrawals(seller.address)).to.equal(
            bidAmount,
        );
        await expect(auctionMarket.endAuction(auctionId)).to.be.revertedWith(
            "Auction already ended",
        );
    });

    it("should return the NFT to the seller when there are no bids", async function () {
        const { seller, auctionMarket, nft, auctionId, tokenId, duration } =
            await createAuctionFixture();

        await networkHelpers.time.increase(duration);
        await auctionMarket.endAuction(auctionId);

        expect(await nft.ownerOf(tokenId)).to.equal(seller.address);
        expect(await auctionMarket.pendingWithdrawals(seller.address)).to.equal(
            0n,
        );
    });

    it("should let an outbid bidder withdraw once", async function () {
        const { auctionMarket, auctionId, bidder, bidder2 } =
            await createAuctionFixture();
        const firstBid = ethers.parseEther("1");
        const secondBid = ethers.parseEther("1.5");
        const auctionMarketAsBidder = auctionMarket.connect(
            bidder,
        ) as typeof auctionMarket;

        await auctionMarketAsBidder.bid(auctionId, { value: firstBid });
        await (auctionMarket.connect(bidder2) as typeof auctionMarket).bid(
            auctionId,
            { value: secondBid },
        );

        await auctionMarketAsBidder.withdraw();
        expect(await auctionMarket.pendingWithdrawals(bidder.address)).to.equal(
            0n,
        );
        await expect(auctionMarketAsBidder.withdraw()).to.be.revertedWith(
            "No funds to withdraw",
        );
    });
});
