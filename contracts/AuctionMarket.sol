// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "./interface/IPriceOracle.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

struct Auction {
    address seller;
    address nft;
    uint256 tokenId;
    uint256 startPrice;
    uint256 highestBid;
    address highestBidder;
    uint256 endTime;
    bool ended;
    bool exists;
}

contract AuctionMarket is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    uint256 private auctionIdCounter;
    mapping(uint256 => Auction) private auctionsById;
    mapping(address => uint256) public pendingWithdrawals;
    IPriceOracle public priceOracle;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _priceOracle) public initializer {
        require(_priceOracle != address(0), "Invalid price oracle address");
        __Ownable_init(msg.sender);
        priceOracle = IPriceOracle(_priceOracle);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    event AuctionCreated(
        uint256 indexed auctionId,
        address indexed seller,
        address indexed nft,
        uint256 tokenId
    );
    event BidPlaced(
        uint256 indexed auctionId,
        address indexed bidder,
        uint256 amount
    );
    event AuctionEnded(
        uint256 indexed auctionId,
        address winner,
        uint256 amount
    );
    event Withdrawal(address indexed user, uint256 amount);
    function createAuction(
        address nft,
        uint256 tokenId,
        uint256 startPrice,
        uint256 duration
    ) external {
        require(duration > 0, "Duration must be greater than 0");
        require(nft != address(0), "NFT address must be valid");
        require(
            IERC721(nft).ownerOf(tokenId) == msg.sender,
            "Caller must own the NFT"
        );
        Auction memory auction = Auction({
            seller: msg.sender,
            nft: nft,
            tokenId: tokenId,
            startPrice: startPrice,
            highestBid: 0,
            highestBidder: address(0),
            endTime: block.timestamp + duration,
            ended: false,
            exists: true
        });

        // Transfer the NFT to the auction contract
        IERC721(nft).transferFrom(msg.sender, address(this), tokenId);
        auctionsById[auctionIdCounter] = auction;
        auctionIdCounter++;
        emit AuctionCreated(auctionIdCounter - 1, msg.sender, nft, tokenId);
    }

    function bid(uint256 auctionId) external payable {
        Auction storage auction = auctionsById[auctionId];
        require(auction.exists, "Auction does not exist");
        require(
            msg.sender != auction.seller,
            "Seller cannot bid on their own auction"
        );
        require(!auction.ended, "Auction already ended");

        require(block.timestamp < auction.endTime, "Auction has ended");
        require(
            msg.value >= auction.startPrice && msg.value > auction.highestBid,
            "Bid is too low"
        );

        address previousHighestBidder = auction.highestBidder;
        uint256 previousHighestBid = auction.highestBid;
        auction.highestBid = msg.value;
        auction.highestBidder = msg.sender;
        // Refund the previous highest bidder
        if (previousHighestBidder != address(0)) {
            pendingWithdrawals[previousHighestBidder] += previousHighestBid;
        }
        emit BidPlaced(auctionId, msg.sender, msg.value);
    }

    function endAuction(uint256 auctionId) external {
        Auction storage auction = auctionsById[auctionId];
        require(auction.exists, "Auction does not exist");
        require(
            block.timestamp >= auction.endTime,
            "Auction has not ended yet"
        );
        require(!auction.ended, "Auction already ended");
        auction.ended = true;
        if (auction.highestBidder != address(0)) {
            IERC721(auction.nft).transferFrom(
                address(this),
                auction.highestBidder,
                auction.tokenId
            );

            pendingWithdrawals[auction.seller] += auction.highestBid;
        } else {
            IERC721(auction.nft).transferFrom(
                address(this),
                auction.seller,
                auction.tokenId
            );
        }
        emit AuctionEnded(auctionId, auction.highestBidder, auction.highestBid);
    }

    function withdraw() external {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "No funds to withdraw");
        pendingWithdrawals[msg.sender] = 0;
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Withdrawal failed");
        emit Withdrawal(msg.sender, amount);
    }

    function getAuction(
        uint256 auctionId
    ) external view returns (Auction memory) {
        return auctionsById[auctionId];
    }

    function getAuctionCount() external view returns (uint256) {
        return auctionIdCounter;
    }

    function getStartPriceUsd(
        uint256 auctionId
    ) external view returns (uint256) {
        Auction storage auction = auctionsById[auctionId];
        require(auction.exists, "Auction does not exist");
        if (auction.startPrice == 0) {
            return 0;
        }
        return priceOracle.convertEthToUsd(auction.startPrice);
    }

    function getHighestBidUsd(
        uint256 auctionId
    ) external view returns (uint256) {
        Auction storage auction = auctionsById[auctionId];
        require(auction.exists, "Auction does not exist");
        if (auction.highestBid == 0) {
            return 0;
        }
        return priceOracle.convertEthToUsd(auction.highestBid);
    }
}
