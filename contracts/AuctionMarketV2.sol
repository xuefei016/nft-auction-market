// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./AuctionMarket.sol";

contract AuctionMarketV2 is AuctionMarket {
    function version() external pure returns (uint256) {
        return 2;
    }
}
