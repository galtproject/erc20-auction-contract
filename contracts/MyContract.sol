pragma solidity ^0.5.13;


contract MyContract {
  function foo() external pure returns (string memory) {
    return "foo";
  }

  function balance() external view returns (uint256) {
    return address(this).balance;
  }
}
