// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "./interface/IPriceOracle.sol";

contract PriceOracle is IPriceOracle {
    AggregatorV3Interface public ethUsdFeed;

    constructor(address _priceFeed) {
        require(_priceFeed != address(0), "Invalid address");
        ethUsdFeed = AggregatorV3Interface(_priceFeed);
    }

    function getEthUsdPrice() public view returns (uint256) {
        (, int256 price, , uint256 updatedAt, ) = ethUsdFeed.latestRoundData();
        require(price > 0, "Invalid Price");
        require(updatedAt > 0, "Round not complete");
        require(updatedAt <= block.timestamp, "Invalid update time");
        return uint256(price);
    }

    function convertEthToUsd(
        uint256 ethAmount
    ) external view returns (uint256) {
        uint256 ethAmountInUsd = (ethAmount * getEthUsdPrice()) /
            10 ** ethUsdFeed.decimals();
        return ethAmountInUsd;
    }
}
