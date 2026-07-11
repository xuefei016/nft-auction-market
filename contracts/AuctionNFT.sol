// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract AuctionNFT is ERC721 {
    uint256 private _tokenId = 0;
    constructor() ERC721("AuctionNFT", "ANFT") {}

    function mint(address to) external returns (uint256) {
        require(to != address(0), "address invalid");
        _safeMint(to, _tokenId);
        return _tokenId++;
    }
}
