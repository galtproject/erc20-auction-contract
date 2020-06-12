pragma solidity 0.5.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/ownership/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

contract ERC20Auction is Ownable {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;

  // CONSTANTS
  uint256 public constant HUNDRED_PCT = 100 ether;

  // EVENTS
  event ClaimEthForPeriod(uint256 indexed periodId, address indexed msgSender, uint256 net, uint256 fee);
  event ClaimErc20ForPeriod(uint256 indexed periodId, address indexed msgSender, uint256 net, uint256 fee);
  event DepositEthForPeriod(uint256 indexed periodId, address indexed msgSender, uint256 amount);
  event DepositErc20ForPeriod(uint256 indexed periodId, address indexed msgSender, uint256 amount);
  event WithdrawOwnerEthReward(address to, uint256 amount);
  event WithdrawOwnerErc20Reward(address to, uint256 amount);

  // STRUCTS
  struct Period {
    uint256 totalEthDeposits;
    uint256 totalErc20Deposits;

    mapping(address => uint256) userEthDeposit;
    mapping(address => uint256) userErc20Deposit;

    mapping(address => bool) userEthPayoutClaimed;
    mapping(address => bool) userErc20PayoutClaimed;
  }

  // PUBLIC VARS
  uint256 public genesisTimestamp;
  // in seconds
  uint256 public periodLength;
  // 100% == 100 ether
  uint256 public withdrawFee;
  IERC20 public erc20Token;

  uint256 public ownerEthReward;
  uint256 public ownerErc20Reward;

  mapping(uint256 => Period) public periods;

  // CONSTRUCTOR
  constructor(
    // can be changed later:
    uint256 _genesisTimestamp,
    uint256 _periodLength,
    uint256 _withdrawFee,
    address _erc20Token
  ) public {
    require(_withdrawFee < 100 ether, "ERC20Auction: ");
    genesisTimestamp = _genesisTimestamp;
    periodLength = _periodLength;
    withdrawFee = _withdrawFee;

    erc20Token = IERC20(_erc20Token);
  }

  // OWNER INTERFACE
  function withdrawOwnerEthReward(address payable _to) external onlyOwner {
    uint256 amount = ownerEthReward;
    require(amount > 0, "ERC20Auction: There is no ETH reward yet");

    ownerEthReward = 0;

    emit WithdrawOwnerEthReward(_to, amount);

    _to.transfer(amount);
  }

  function withdrawOwnerErc20Reward(address _to) external onlyOwner {
    uint256 amount = ownerErc20Reward;
    require(amount > 0, "ERC20Auction: There is no ERC20 reward yet");

    ownerEthReward = 0;

    emit WithdrawOwnerErc20Reward(_to, amount);

    erc20Token.transfer(_to, amount);
  }

  // USER INTERFACE
  function depositEthForPeriod(uint256 _periodId) public payable {
    require(_periodId >= getCurrentPeriodId(), "ERC20Auction: Period ID from the past");

    Period storage p = periods[_periodId];
    uint256 amount = msg.value;
    address msgSender = msg.sender;

    // p.userEthDeposit[msgSender] += amount
    p.userEthDeposit[msgSender] = p.userEthDeposit[msgSender].add(amount);
    // p.totalEthDeposits += amount
    p.totalEthDeposits = p.totalEthDeposits.add(amount);

    emit DepositEthForPeriod(_periodId, msgSender, amount);
  }

  function depositEth() public payable {
    depositEthForPeriod(getCurrentPeriodId());
  }

  function () external payable {
    depositEth();
  }

  function depositErc20ForPeriod(uint256 _periodId, uint256 _amount) public {
    require(_periodId >= getCurrentPeriodId(), "ERC20Auction: Period ID from the past");

    Period storage p = periods[_periodId];
    address msgSender = msg.sender;

    // p.userErc20Deposit[msgSender] += _amount
    p.userErc20Deposit[msgSender] = p.userErc20Deposit[msgSender].add(_amount);
    // p.totalErc20Deposits += _amount
    p.totalErc20Deposits = p.totalErc20Deposits.add(_amount);

    emit DepositErc20ForPeriod(_periodId, msgSender, _amount);

    erc20Token.transfer(address(this), _amount);
  }

  function depositErc20(uint256 _amount) external payable {
    depositErc20ForPeriod(getCurrentPeriodId(), _amount);
  }

  function claimEthForPeriod(uint256 _periodId) public {
    require(_periodId < getCurrentPeriodId(), "ERC20Auction: Period not finished yet");

    Period storage p = periods[_periodId];
    address msgSender = msg.sender;

    require(p.userEthPayoutClaimed[msgSender] == false, "ERC20Auction: Already claimed");
    require(p.totalEthDeposits > 0, "ERC20Auction: Missing ETH deposits");
    require(p.userErc20Deposit[msgSender] > 0, "ERC20Auction: Missing the user ERC20 deposit");

    (uint256 net, uint256 fee) = calculateEthReturn(_periodId, msgSender);

    p.userEthPayoutClaimed[msgSender] = true;

    emit ClaimEthForPeriod(_periodId, msgSender, net, fee);
  }

  function claimErc20ForPeriod(uint256 _periodId) public {
    require(_periodId < getCurrentPeriodId(), "ERC20Auction: Period not finished yet");

    Period storage p = periods[_periodId];
    address msgSender = msg.sender;

    require(p.userErc20PayoutClaimed[msgSender] == false, "ERC20Auction: Already claimed");
    require(p.totalErc20Deposits > 0, "ERC20Auction: Missing ERC20 deposits");
    require(p.userEthDeposit[msgSender] > 0, "ERC20Auction: Missing the user ETH deposit");

    (uint256 net, uint256 fee) = calculateErc20Return(_periodId, msgSender);

    p.userErc20PayoutClaimed[msgSender] = true;

    emit ClaimErc20ForPeriod(_periodId, msgSender, net, fee);
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

  function calculateWithdrawFee(uint256 _amount) public view returns (uint256) {
    return _amount * withdrawFee / HUNDRED_PCT;
  }

  function calculateGrossEthReturn(uint256 _periodId, address _user) public view returns (uint256) {
    Period storage p = periods[_periodId];

    return p.totalEthDeposits * p.userErc20Deposit[_user] / p.totalErc20Deposits;
  }

  function calculateGrossErc20Return(uint256 _periodId, address _user) public view returns (uint256) {
    Period storage p = periods[_periodId];

    return p.totalErc20Deposits * p.userEthDeposit[_user] / p.totalEthDeposits;
  }

  function calculateEthReturn(uint256 _periodId, address _user) public view returns (uint256 net, uint256 fee) {
    uint256 gross = calculateGrossEthReturn(_periodId, _user);

    fee = calculateWithdrawFee(gross);
    net = gross - fee;
  }

  function calculateErc20Return(uint256 _periodId, address _user) public view returns (uint256 net, uint256 fee) {
    uint256 gross = calculateGrossErc20Return(_periodId, _user);

    fee = calculateWithdrawFee(gross);
    net = gross - fee;
  }
}
