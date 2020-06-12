pragma solidity 0.5.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/ownership/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

contract ERC20Auction is Ownable {
  using SafeMath for uint256;

  // PUBLIC VARS
  uint256 public genesisTimestamp;
  uint256 public periodLength;
  IERC20 public erc20Token;

  constructor(
    // can be changed later:
    uint256 _genesisTimestamp,
    uint256 _periodLength,
    address _erc20Token
  ) public {
    genesisTimestamp = _genesisTimestamp;
    periodLength = _periodLength;

    erc20Token = IERC20(_erc20Token);
  }

  // GETTERS
  function getCurrentPeriodId() public view returns (uint256) {
    uint256 blockTimestamp = block.timestamp;

    require(
      blockTimestamp > genesisTimestamp,
      "YALLDistributor: Contract not initiated yet"
    );

    return (blockTimestamp - genesisTimestamp) / periodLength;
  }

  function getPeriodBeginsAt(uint256 _periodId)
    external
    view
    returns (uint256)
  {
    // return (_periodId * periodLength) + genesisTimestamp
    return (_periodId.mul(periodLength)).add(genesisTimestamp);
  }
}
