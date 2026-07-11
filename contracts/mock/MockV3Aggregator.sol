// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {
    MockV3Aggregator as ChainlinkMockV3Aggregator
} from "@chainlink/contracts/src/v0.8/shared/mocks/MockV3Aggregator.sol";

contract MockV3Aggregator is ChainlinkMockV3Aggregator {
    constructor(
        uint8 _decimals,
        int256 _initialAnswer
    ) ChainlinkMockV3Aggregator(_decimals, _initialAnswer) {}
}
