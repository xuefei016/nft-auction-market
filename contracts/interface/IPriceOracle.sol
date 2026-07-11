// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPriceOracle {
    function convertEthToUsd(uint256 ethAmount) external view returns (uint256);
}
