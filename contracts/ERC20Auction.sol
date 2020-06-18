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
  event ClaimEthForPeriod(
    uint256 indexed periodId,
    address indexed msgSender,
    uint256 net,
    uint256 fee
  );
  event ClaimErc20ForPeriod(
    uint256 indexed periodId,
    address indexed msgSender,
    uint256 net,
    uint256 fee
  );
  event DepositEthForPeriod(
    uint256 indexed periodId,
    address indexed msgSender,
    uint256 amount
  );
  event DepositErc20ForPeriod(
    uint256 indexed periodId,
    address indexed msgSender,
    uint256 amount
  );
  event Stop();
  event WithdrawEthDepositForPeriod(
    uint256 indexed periodId,
    address indexed msgSender,
    uint256 amount
  );
  event WithdrawErc20DepositForPeriod(
    uint256 indexed periodId,
    address indexed msgSender,
    uint256 amount
  );
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
    mapping(address => bool) userEthDepositWithdrawn;
    mapping(address => bool) userErc20DepositWithdrawn;
  }

  // PUBLIC VARS
  uint256 public genesisTimestamp;
  // in seconds
  uint256 public periodLength;
  // 100% == 100 ether
  uint256 public withdrawalFee;
  IERC20 public erc20Token;

  uint256 public ownerEthReward;
  uint256 public ownerErc20Reward;

  // can be stopped only once
  bool public stopped;

  mapping(uint256 => Period) public periods;

  modifier notStopped() {
    require(stopped == false, "ERC20Auction: The contract is stopped");
    _;
  }

  modifier onlyStopped() {
    require(stopped == true, "ERC20Auction: The contract should be stopped");
    _;
  }

  // CONSTRUCTOR
  constructor(
    // can be changed later:
    uint256 _genesisTimestamp,
    uint256 _periodLength,
    uint256 _withdrawalFee,
    address _erc20Token
  ) public {
    require(_withdrawalFee < 100 ether, "ERC20Auction: ");
    genesisTimestamp = _genesisTimestamp;
    periodLength = _periodLength;
    withdrawalFee = _withdrawalFee;

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

    ownerErc20Reward = 0;

    emit WithdrawOwnerErc20Reward(_to, amount);

    erc20Token.transfer(_to, amount);
  }

  function stop() external onlyOwner notStopped {
    stopped = true;

    emit Stop();
  }

  // USER INTERFACE
  function depositEthForPeriod(uint256 _periodId) public payable notStopped {
    require(
      _periodId >= getCurrentPeriodId(),
      "ERC20Auction: Period ID from the past"
    );

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

  function() external payable {
    depositEth();
  }

  function depositErc20ForPeriod(uint256 _periodId, uint256 _amount)
    public
    notStopped
  {
    require(
      _periodId >= getCurrentPeriodId(),
      "ERC20Auction: Period ID from the past"
    );

    Period storage p = periods[_periodId];
    address msgSender = msg.sender;

    // p.userErc20Deposit[msgSender] += _amount
    p.userErc20Deposit[msgSender] = p.userErc20Deposit[msgSender].add(_amount);
    // p.totalErc20Deposits += _amount
    p.totalErc20Deposits = p.totalErc20Deposits.add(_amount);

    emit DepositErc20ForPeriod(_periodId, msgSender, _amount);

    erc20Token.transferFrom(msgSender, address(this), _amount);
  }

  function depositErc20(uint256 _amount) external payable {
    depositErc20ForPeriod(getCurrentPeriodId(), _amount);
  }

  function withdrawEthDepositForPeriod(uint256 _periodId) external {
    Period storage p = periods[_periodId];
    address payable msgSender = msg.sender;

    require(
      canWithdrawStopped(_periodId) || canWithdrawNoErc20Deposit(_periodId),
      "ERC20Auction: Neither stopped nor 0 ERC20 deposit for the period"
    );

    require(
      p.userErc20PayoutClaimed[msgSender] == false,
      "ERC20Auction: ERC20 reward was already claimed"
    );

    require(
      p.userEthDepositWithdrawn[msgSender] == false,
      "ERC20Auction: ETH deposit was already withdrawn"
    );

    uint256 amount = p.userEthDeposit[msgSender];

    require(amount > 0, "ERC20Auction: Missing user ETH deposit");
    p.userEthDeposit[msgSender] = 0;

    // p.totalEthDeposits -= _amount
    p.totalEthDeposits = p.totalEthDeposits.sub(amount);

    p.userEthDepositWithdrawn[msgSender] = true;

    msgSender.transfer(amount);

    emit WithdrawEthDepositForPeriod(_periodId, msgSender, amount);
  }

  function withdrawErc20DepositForPeriod(uint256 _periodId) external {
    Period storage p = periods[_periodId];
    address payable msgSender = msg.sender;

    require(
      canWithdrawStopped(_periodId) || canWithdrawNoEthDeposit(_periodId),
      "ERC20Auction: Neither stopped nor 0 ETH deposit for the period"
    );

    require(
      p.userEthPayoutClaimed[msgSender] == false,
      "ERC20Auction: ETH reward was already claimed"
    );

    require(
      p.userErc20DepositWithdrawn[msgSender] == false,
      "ERC20Auction: ERC20 deposit was already withdrawn"
    );

    uint256 amount = p.userErc20Deposit[msgSender];

    require(amount > 0, "ERC20Auction: Missing user ERC20 deposit");
    p.userErc20Deposit[msgSender] = 0;

    // p.totalErc20Deposits -= _amount
    p.totalErc20Deposits = p.totalErc20Deposits.sub(amount);

    p.userErc20DepositWithdrawn[msgSender] = true;

    erc20Token.transfer(msg.sender, amount);

    emit WithdrawErc20DepositForPeriod(_periodId, msgSender, amount);
  }

  function claimEthForPeriod(uint256 _periodId) external {
    require(
      _periodId < getCurrentPeriodId(),
      "ERC20Auction: Period not finished yet"
    );

    Period storage p = periods[_periodId];
    address payable msgSender = msg.sender;

    require(
      p.userEthPayoutClaimed[msgSender] == false,
      "ERC20Auction: Already claimed"
    );
    require(p.totalEthDeposits > 0, "ERC20Auction: Missing ETH deposits");
    require(
      p.userErc20Deposit[msgSender] > 0,
      "ERC20Auction: Missing the user ERC20 deposit"
    );

    (uint256 net, uint256 fee) = calculateEthReturn(_periodId, msgSender);

    p.userEthPayoutClaimed[msgSender] = true;

    // ownerEthReward += fee
    ownerEthReward = ownerEthReward.add(fee);

    msgSender.transfer(net);

    emit ClaimEthForPeriod(_periodId, msgSender, net, fee);
  }

  function claimErc20ForPeriod(uint256 _periodId) external {
    require(
      _periodId < getCurrentPeriodId(),
      "ERC20Auction: Period not finished yet"
    );

    Period storage p = periods[_periodId];
    address msgSender = msg.sender;

    require(
      p.userErc20PayoutClaimed[msgSender] == false,
      "ERC20Auction: Already claimed"
    );
    require(p.totalErc20Deposits > 0, "ERC20Auction: Missing ERC20 deposits");
    require(
      p.userEthDeposit[msgSender] > 0,
      "ERC20Auction: Missing the user ETH deposit"
    );

    (uint256 net, uint256 fee) = calculateErc20Return(_periodId, msgSender);

    p.userErc20PayoutClaimed[msgSender] = true;

    // ownerErc20Reward += fee
    ownerErc20Reward = ownerErc20Reward.add(fee);

    erc20Token.transfer(msgSender, net);

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

  function canWithdrawStopped(uint256 _periodId) public view returns (bool) {
    return (stopped == true && getCurrentPeriodId() <= _periodId);
  }

  function canWithdrawNoEthDeposit(uint256 _periodId)
    public
    view
    returns (bool)
  {
    return (periods[_periodId].totalEthDeposits == 0 &&
      getCurrentPeriodId() > _periodId);
  }

  function canWithdrawNoErc20Deposit(uint256 _periodId)
    public
    view
    returns (bool)
  {
    return (periods[_periodId].totalErc20Deposits == 0 &&
      getCurrentPeriodId() > _periodId);
  }

  function calculateWithdrawalFee(uint256 _amount)
    public
    view
    returns (uint256)
  {
    return (_amount * withdrawalFee) / HUNDRED_PCT;
  }

  function calculateGrossEthReturn(uint256 _periodId, address _user)
    public
    view
    returns (uint256)
  {
    Period storage p = periods[_periodId];

    return
      (p.totalEthDeposits * p.userErc20Deposit[_user]) / p.totalErc20Deposits;
  }

  function calculateGrossErc20Return(uint256 _periodId, address _user)
    public
    view
    returns (uint256)
  {
    Period storage p = periods[_periodId];

    return
      (p.totalErc20Deposits * p.userEthDeposit[_user]) / p.totalEthDeposits;
  }

  function calculateEthReturn(uint256 _periodId, address _user)
    public
    view
    returns (uint256 net, uint256 fee)
  {
    uint256 gross = calculateGrossEthReturn(_periodId, _user);

    fee = calculateWithdrawalFee(gross);
    net = gross - fee;
  }

  function calculateErc20Return(uint256 _periodId, address _user)
    public
    view
    returns (uint256 net, uint256 fee)
  {
    uint256 gross = calculateGrossErc20Return(_periodId, _user);

    fee = calculateWithdrawalFee(gross);
    net = gross - fee;
  }

  function getPeriodTotalEthDeposits(uint256 _periodId)
    external
    view
    returns (uint256)
  {
    return periods[_periodId].totalEthDeposits;
  }

  function getPeriodTotalErc20Deposits(uint256 _periodId)
    external
    view
    returns (uint256)
  {
    return periods[_periodId].totalErc20Deposits;
  }

  // TODO: add forPeriod suffix
  function getUserEthDepositForPeriod(uint256 _periodId, address _user)
    external
    view
    returns (uint256)
  {
    return periods[_periodId].userEthDeposit[_user];
  }

  function getUserErc20DepositForPeriod(uint256 _periodId, address _user)
    external
    view
    returns (uint256)
  {
    return periods[_periodId].userErc20Deposit[_user];
  }

  function isUserEthPayoutClaimed(uint256 _periodId, address _user)
    external
    view
    returns (bool)
  {
    return periods[_periodId].userEthPayoutClaimed[_user];
  }

  function isUserErc20PayoutClaimed(uint256 _periodId, address _user)
    external
    view
    returns (bool)
  {
    return periods[_periodId].userErc20PayoutClaimed[_user];
  }

  function isUserEthDepositWithdrawn(uint256 _periodId, address _user)
    external
    view
    returns (bool)
  {
    return periods[_periodId].userEthDepositWithdrawn[_user];
  }

  function isUserErc20DepositWithdrawn(uint256 _periodId, address _user)
    external
    view
    returns (bool)
  {
    return periods[_periodId].userErc20DepositWithdrawn[_user];
  }
}
