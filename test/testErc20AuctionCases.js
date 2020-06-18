// eslint-disable-next-line no-unused-vars
const { accounts, defaultSender } = require('@openzeppelin/test-environment');
const { assert } = require('chai');
// eslint-disable-next-line import/order
const { contract } = require('./twrapper');
// eslint-disable-next-line import/order
const {
  ether,
  now,
  assertRevert,
  increaseTime,
  // eslint-disable-next-line import/order
} = require('@galtproject/solidity-test-chest')(web3);

const ERC20Mintable = contract.fromArtifact('ERC20Mintable');
const ERC20Auction = contract.fromArtifact('ERC20Auction');

ERC20Mintable.numberFormat = 'String';
ERC20Auction.numberFormat = 'String';

describe('ERC20Auction', () => {
  const [owner, alice, bob, charlie, dan, eve, frank] = accounts;

  let auction;
  let token;
  let genesisTimestamp;
  let periodLength;
  let startAfter;
  let withdrawalFee;

  before(async function () {
    token = await ERC20Mintable.new();
    await token.mint(alice, ether(2000000));
    await token.mint(bob, ether(2000000));
    await token.mint(charlie, ether(2000000));
    await token.mint(dan, ether(2000000));
    await token.mint(eve, ether(2000000));
    await token.mint(frank, ether(2000000));

    startAfter = 30;
    withdrawalFee = ether(12);
    periodLength = 3600;
  });

  beforeEach(async function () {
    genesisTimestamp = (await now()) + startAfter;
    auction = await ERC20Auction.new(genesisTimestamp, periodLength, withdrawalFee, token.address, { from: owner });
  });

  it('correctly handle test case #1', async function () {
    await increaseTime(40);

    // >>> WAVE #0 (during period #0)
    assert.equal(await auction.getCurrentPeriodId(), 0);
    // For period 0:
    // bob ERC20 5
    await token.approve(auction.address, ether(5), { from: bob });
    await auction.depositErc20(ether(5), { from: bob });

    // AFTER WAVE #0 ASSERTIONS
    let details = await auction.periods(0);
    assert.equal(details.totalEthDeposits, 0);
    assert.equal(details.totalErc20Deposits, ether(5));

    await increaseTime(periodLength);

    // //////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////

    // >>> WAVE #1 (during period #1)
    assert.equal(await auction.getCurrentPeriodId(), 1);
    // For period 1:
    // alice ETH 30
    await auction.depositEthForPeriod(1, { value: ether(30), from: alice });
    // bob ETH 40
    await auction.depositEthForPeriod(1, { value: ether(40), from: bob });
    // charlie ETH 40
    await auction.depositEthForPeriod(1, { value: ether(40), from: charlie });
    // total ETH 110

    // dan ERC20 5
    await token.approve(auction.address, ether(5), { from: dan });
    await auction.depositErc20(ether(5), { from: dan });
    // eve ERC20 10
    await token.approve(auction.address, ether(10), { from: eve });
    await auction.depositErc20ForPeriod(1, ether(10), { from: eve });
    // frank ERC20 2
    await token.approve(auction.address, ether(2), { from: frank });
    await auction.depositErc20ForPeriod(1, ether(2), { from: frank });
    // total ERC20 17

    // For period 2:
    // alice ETH 15
    await auction.depositEthForPeriod(2, { value: ether(15), from: alice });
    // Period 3:
    // frank ERC20 5
    await token.approve(auction.address, ether(5), { from: frank });
    await auction.depositErc20ForPeriod(3, ether(5), { from: frank });

    // AFTER WAVE #1 ASSERTIONS
    details = await auction.periods(1);
    assert.equal(details.totalEthDeposits, ether(110));
    assert.equal(details.totalErc20Deposits, ether(17));
    assert.equal(await auction.getPeriodTotalEthDeposits(0), ether(0));
    assert.equal(await auction.getPeriodTotalErc20Deposits(0), ether(5));
    assert.equal(await auction.getPeriodTotalEthDeposits(1), ether(110));
    assert.equal(await auction.getPeriodTotalErc20Deposits(1), ether(17));
    assert.equal(await auction.getUserEthDepositForPeriod(1, alice), ether(30));
    assert.equal(await auction.getUserEthDepositForPeriod(1, bob), ether(40));
    assert.equal(await auction.getUserEthDepositForPeriod(1, charlie), ether(40));
    assert.equal(await auction.getUserErc20DepositForPeriod(1, dan), ether(5));
    assert.equal(await auction.getUserErc20DepositForPeriod(1, eve), ether(10));
    assert.equal(await auction.getUserErc20DepositForPeriod(1, frank), ether(2));

    assert.equal(await auction.getPeriodTotalEthDeposits(2), ether(15));
    assert.equal(await auction.getPeriodTotalErc20Deposits(2), ether(0));
    assert.equal(await auction.getPeriodTotalEthDeposits(3), ether(0));
    assert.equal(await auction.getPeriodTotalErc20Deposits(3), ether(5));

    await increaseTime(periodLength);

    // //////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////

    // >>> WAVE #2 (during period #2). Mixed case
    assert.equal(await auction.getCurrentPeriodId(), 2);
    assert.equal(await auction.getPeriodTotalErc20Deposits(3), ether(5));
    // For period 2:
    // alice ETH 200
    await web3.eth.sendTransaction({ value: ether(200), from: alice, to: auction.address });
    // bob ETH 300
    await web3.eth.sendTransaction({ value: ether(300), from: bob, to: auction.address });
    // charlie ETH 400
    await web3.eth.sendTransaction({ value: ether(400), from: charlie, to: auction.address });
    // dan ETH 400
    await web3.eth.sendTransaction({ value: ether(400), from: dan, to: auction.address });
    // total ETH 1315 (with alice 15 ETH deposit from period #1)

    // alice ERC20 5
    await token.approve(auction.address, ether(5), { from: alice });
    await auction.depositErc20(ether(5), { from: alice });
    // bob ERC20 9
    await token.approve(auction.address, ether(9), { from: bob });
    await auction.depositErc20(ether(9), { from: bob });
    // charlie ERC20 2
    await token.approve(auction.address, ether(2), { from: charlie });
    await auction.depositErc20(ether(2), { from: charlie });
    // frank ERC20 1
    await token.approve(auction.address, ether(1), { from: frank });
    await auction.depositErc20(ether(1), { from: frank });
    // total ERC20 17

    // WAVE #2 CLAIMS/WITHDRAWALS
    await auction.withdrawErc20DepositForPeriod(0, { from: bob });

    await auction.claimErc20ForPeriod(1, { from: alice });
    await auction.claimErc20ForPeriod(1, { from: bob });
    // charlie will claim the reward later
    // await auction.claimErc20ForPeriod(1, { from: charlie });
    await assertRevert(auction.claimErc20ForPeriod(1, { from: dan }));
    await assertRevert(auction.claimErc20ForPeriod(1, { from: eve }));
    await assertRevert(auction.claimErc20ForPeriod(1, { from: frank }));

    await assertRevert(auction.claimEthForPeriod(1, { from: alice }));
    await assertRevert(auction.claimEthForPeriod(1, { from: bob }));
    await assertRevert(auction.claimEthForPeriod(1, { from: charlie }));
    await auction.claimEthForPeriod(1, { from: dan });
    await auction.claimEthForPeriod(1, { from: eve });
    await auction.claimEthForPeriod(1, { from: frank });

    assert.equal(await auction.isUserErc20PayoutClaimed(1, alice), true);
    assert.equal(await auction.isUserErc20PayoutClaimed(1, charlie), false);

    // AFTER WAVE #2 ASSERTIONS
    assert.equal(await auction.getPeriodTotalEthDeposits(0), ether(0));
    assert.equal(await auction.getPeriodTotalErc20Deposits(0), ether(0));
    assert.equal(await auction.getPeriodTotalEthDeposits(1), ether(110));
    assert.equal(await auction.getPeriodTotalErc20Deposits(1), ether(17));
    assert.equal(await auction.getPeriodTotalEthDeposits(2), ether(1315));
    assert.equal(await auction.getPeriodTotalErc20Deposits(2), ether(17));

    await increaseTime(periodLength);

    // //////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////

    // >>> WAVE #3 (during period #3)
    assert.equal(await auction.getCurrentPeriodId(), 3);

    // alice ETH 200
    await web3.eth.sendTransaction({ value: ether(200), from: alice, to: auction.address });

    // WAVE #3 CLAIMS/WITHDRAWALS
    await auction.claimErc20ForPeriod(1, { from: charlie });

    await auction.claimErc20ForPeriod(2, { from: alice });
    await auction.claimErc20ForPeriod(2, { from: bob });
    await auction.claimErc20ForPeriod(2, { from: charlie });

    await auction.claimEthForPeriod(2, { from: alice });
    await auction.claimEthForPeriod(2, { from: bob });
    await auction.claimEthForPeriod(2, { from: charlie });

    assert.equal(await auction.isUserErc20PayoutClaimed(2, alice), true);
    assert.equal(await auction.isUserErc20PayoutClaimed(2, bob), true);
    assert.equal(await auction.isUserErc20PayoutClaimed(2, charlie), true);
    assert.equal(await auction.isUserErc20PayoutClaimed(2, dan), false);

    assert.equal(await auction.isUserEthPayoutClaimed(2, alice), true);
    assert.equal(await auction.isUserEthPayoutClaimed(2, bob), true);
    assert.equal(await auction.isUserEthPayoutClaimed(2, charlie), true);
    assert.equal(await auction.isUserEthPayoutClaimed(2, frank), false);

    // AFTER WAVE #3 ASSERTIONS
    assert.equal(await auction.getPeriodTotalEthDeposits(3), ether(200));
    assert.equal(await auction.getPeriodTotalErc20Deposits(3), ether(5));

    await increaseTime(periodLength);

    // //////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////

    // >>> WAVE #4 (during period #4) Final withdrawal
    assert.equal(await auction.getCurrentPeriodId(), 4);

    await auction.claimEthForPeriod(2, { from: frank });
    await auction.claimErc20ForPeriod(2, { from: dan });

    await auction.claimEthForPeriod(3, { from: frank });
    await auction.claimErc20ForPeriod(3, { from: alice });

    // withdraw owner reward
    await auction.withdrawOwnerEthReward(owner, { from: owner });
    await auction.withdrawOwnerErc20Reward(owner, { from: owner });

    // //////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////

    // The leftover both for ETH and ERC20 is 3 wei
    assert.equal(await web3.eth.getBalance(auction.address), 3);
    assert.equal(await token.balanceOf(auction.address), 3);
  });

  it('correctly handle test case #2', async function () {
    await increaseTime(40);

    // >>> WAVE #0 (during period #0)
    assert.equal(await auction.getCurrentPeriodId(), 0);
    // For period 0:
    // bob ERC20 5
    await token.approve(auction.address, ether(5), { from: bob });
    await auction.depositErc20(ether(5), { from: bob });

    // AFTER WAVE #0 ASSERTIONS
    const details = await auction.periods(0);
    assert.equal(details.totalEthDeposits, 0);
    assert.equal(details.totalErc20Deposits, ether(5));

    await increaseTime(periodLength);

    // //////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////

    // >>> WAVE #1 (during period #1)
    assert.equal(await auction.getCurrentPeriodId(), 1);
    // For period 1:
    await auction.depositEthForPeriod(1, { value: ether(30), from: alice });
    await auction.depositEthForPeriod(1, { value: ether(40), from: bob });
    await auction.depositEthForPeriod(1, { value: ether(40), from: charlie });
    // total ETH 110

    await token.approve(auction.address, ether(5), { from: dan });
    await auction.depositErc20(ether(5), { from: dan });
    await token.approve(auction.address, ether(10), { from: eve });
    await auction.depositErc20(ether(10), { from: eve });
    await token.approve(auction.address, ether(2), { from: frank });
    await auction.depositErc20(ether(2), { from: frank });
    // total ERC20 17

    // For period 2:
    // alice ETH 15
    await auction.depositEthForPeriod(2, { value: ether(15), from: alice });

    // Period 3:
    // frank ERC20 5
    await token.approve(auction.address, ether(5), { from: frank });
    await auction.depositErc20ForPeriod(3, ether(5), { from: frank });

    await increaseTime(periodLength);

    // //////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////

    // >>> WAVE #2 (during period #2). Partial withdrawal case
    assert.equal(await auction.getCurrentPeriodId(), 2);

    // For period 3:
    // frank ERC20 15
    await token.approve(auction.address, ether(15), { from: frank });
    await auction.depositErc20ForPeriod(3, ether(15), { from: frank });

    // WAVE #2 CLAIMS/WITHDRAWALS
    await auction.withdrawErc20DepositForPeriod(0, { from: bob });

    await auction.claimErc20ForPeriod(1, { from: alice });
    await auction.claimErc20ForPeriod(1, { from: bob });

    // STOP
    await auction.stop({ from: owner });

    // CLAIMS
    // WITHDRAW
    await auction.claimErc20ForPeriod(1, { from: charlie });
    await auction.claimEthForPeriod(1, { from: eve });
    await auction.claimEthForPeriod(1, { from: frank });
    await auction.claimEthForPeriod(1, { from: dan });
    await auction.withdrawEthDepositForPeriod(2, { from: alice });

    await auction.withdrawErc20DepositForPeriod(3, { from: frank });

    await increaseTime(periodLength);

    // //////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////

    // >>> WAVE #3
    assert.equal(await auction.getCurrentPeriodId(), 3);

    // withdraw owner reward
    await auction.withdrawOwnerEthReward(owner, { from: owner });
    await auction.withdrawOwnerErc20Reward(owner, { from: owner });

    // //////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////

    // The leftover both for ETH and ERC20 is 3 wei
    assert.equal(await web3.eth.getBalance(auction.address), 1);
    assert.equal(await token.balanceOf(auction.address), 1);
  });
});
