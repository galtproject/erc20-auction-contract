// eslint-disable-next-line no-unused-vars
const { accounts, defaultSender } = require('@openzeppelin/test-environment');
const { assert } = require('chai');
const { contract } = require('./twrapper');
// eslint-disable-next-line import/order
const {
  ether,
  now,
  assertRevert,
  increaseTime,
  int,
  assertErc20BalanceChanged,
  assertEthBalanceChanged,
} = require('@galtproject/solidity-test-chest')(web3);

const { BN } = web3.utils;

const ERC20Mintable = contract.fromArtifact('ERC20Mintable');
const ERC20Auction = contract.fromArtifact('ERC20Auction');

ERC20Mintable.numberFormat = 'String';
ERC20Auction.numberFormat = 'String';

function assertEthBalanceIncreased(balanceBefore, balanceAfter, expectedValue) {
  return assertEthBalanceChanged(balanceBefore, balanceAfter, expectedValue);
}

function assertEthBalanceDecreased(balanceBefore, balanceAfter, expectedValue) {
  return assertEthBalanceChanged(balanceBefore, balanceAfter, `-${expectedValue}`);
}

function assertErc20BalanceIncreased(balanceBefore, balanceAfter, expectedValue) {
  return assertErc20BalanceChanged(balanceBefore, balanceAfter, expectedValue);
}

describe('ERC20Auction', () => {
  const [alice, bob, charlie] = accounts;

  let auction;
  let token;
  let genesisTimestamp;
  let periodLength;
  let startAfter;
  let withdrawalFee;
  let withdrawalFeeBN;
  const hundredPctBN = new BN(ether(100));

  before(async function () {
    token = await ERC20Mintable.new();
    await token.mint(alice, ether(2000000));
    await token.mint(bob, ether(2000000));

    startAfter = 30;
    withdrawalFee = ether(12);
    withdrawalFeeBN = new BN(withdrawalFee);
    periodLength = 3600;
  });

  beforeEach(async function () {
    genesisTimestamp = (await now()) + startAfter;
    auction = await ERC20Auction.new(genesisTimestamp, periodLength, withdrawalFee, token.address);
  });

  it('should store constructor arguments', async function () {
    assert.equal(await auction.genesisTimestamp(), genesisTimestamp);
    assert.equal(await auction.periodLength(), periodLength);
    assert.equal(await auction.withdrawalFee(), withdrawalFee);
    assert.equal(await auction.erc20Token(), token.address);
    assert.equal(await auction.owner(), defaultSender);
  });

  describe('User Interface', () => {
    describe('#depositEthForPeriod()', () => {
      it('should allow depositing for the 0th period', async function () {
        await increaseTime(40);
        await auction.depositEthForPeriod(0, { value: 8, from: alice });
      });

      it('should allow depositing for the current period', async function () {
        await increaseTime(periodLength * 2);

        assert.equal(await auction.getCurrentPeriodId(), 1);
        await auction.depositEthForPeriod(1, { value: 8, from: alice });

        const res = await auction.periods(1);
        assert.equal(res.totalEthDeposits, 8);
        assert.equal(res.totalErc20Deposits, 0);
      });

      it('should accumulate multiple deposits for the same period', async function () {
        await increaseTime(periodLength * 2);

        assert.equal(await auction.getCurrentPeriodId(), 1);

        await auction.depositEthForPeriod(2, { value: 8, from: alice });
        let res = await auction.periods(2);
        assert.equal(res.totalEthDeposits, 8);
        assert.equal(await auction.getUserEthDeposit(2, alice), 8);

        await auction.depositEthForPeriod(2, { value: 3, from: alice });
        res = await auction.periods(2);
        assert.equal(res.totalEthDeposits, 11);
        assert.equal(await auction.getUserEthDeposit(2, alice), 11);
      });

      it('should allow depositing for a future period', async function () {
        await increaseTime(periodLength * 2);

        assert.equal(await auction.getCurrentPeriodId(), 1);
        await auction.depositEthForPeriod(3, { value: 8, from: alice });

        const res = await auction.periods(3);
        assert.equal(res.totalEthDeposits, 8);
        assert.equal(res.totalErc20Deposits, 0);
      });

      it('should deny depositing for previous periods', async function () {
        await increaseTime(periodLength * 2);

        assert.equal(await auction.getCurrentPeriodId(), 1);
        await assertRevert(
          auction.depositEthForPeriod(0, { value: 10, from: alice }),
          'ERC20Auction: Period ID from the past'
        );
      });
    });

    describe('#depositEth()', () => {
      it('should allow depositing for the current period', async function () {
        await increaseTime(periodLength * 2);

        assert.equal(await auction.getCurrentPeriodId(), 1);
        await auction.depositEth({ value: 8, from: alice });

        const res = await auction.periods(1);
        assert.equal(res.totalEthDeposits, 8);
        assert.equal(res.totalErc20Deposits, 0);
      });

      it('should allow depositing using a fallback function', async function () {
        await increaseTime(periodLength * 2);

        assert.equal(await auction.getCurrentPeriodId(), 1);
        await web3.eth.sendTransaction({ value: 8, from: alice, to: auction.address });

        const res = await auction.periods(1);
        assert.equal(res.totalEthDeposits, 8);
        assert.equal(res.totalErc20Deposits, 0);
        assert.equal(await auction.getUserEthDeposit(1, alice), 8);
      });

      it('should accumulate multiple deposits for the same period', async function () {
        await increaseTime(periodLength * 3);

        assert.equal(await auction.getCurrentPeriodId(), 2);

        await auction.depositEth({ value: 8, from: alice });
        let res = await auction.periods(2);
        assert.equal(res.totalEthDeposits, 8);
        assert.equal(await auction.getUserEthDeposit(2, alice), 8);

        await auction.depositEth({ value: 3, from: alice });
        res = await auction.periods(2);
        assert.equal(res.totalEthDeposits, 11);
        assert.equal(await auction.getUserEthDeposit(2, alice), 11);
      });
    });

    describe('#depositErc20ForPeriod()', () => {
      it('should allow depositing for the 0th period', async function () {
        await increaseTime(40);
        await token.approve(auction.address, ether(12), { from: alice });
        await auction.depositErc20ForPeriod(0, ether(12), { from: alice });
      });

      it('should allow depositing for the current period', async function () {
        await increaseTime(periodLength * 2);

        assert.equal(await auction.getCurrentPeriodId(), 1);
        await token.approve(auction.address, ether(8), { from: alice });
        await auction.depositErc20ForPeriod(1, ether(8), { from: alice });

        const res = await auction.periods(1);
        assert.equal(res.totalErc20Deposits, ether(8));
        assert.equal(res.totalEthDeposits, 0);
      });

      it('should accumulate multiple deposits for the same period', async function () {
        await increaseTime(periodLength * 2);

        assert.equal(await auction.getCurrentPeriodId(), 1);

        await token.approve(auction.address, ether(8), { from: alice });
        await auction.depositErc20ForPeriod(2, ether(8), { from: alice });
        let res = await auction.periods(2);
        assert.equal(res.totalErc20Deposits, ether(8));
        assert.equal(await auction.getUserErc20Deposit(2, alice), ether(8));

        await token.approve(auction.address, ether(3), { from: alice });
        await auction.depositErc20ForPeriod(2, ether(3), { from: alice });
        res = await auction.periods(2);
        assert.equal(res.totalErc20Deposits, ether(11));
        assert.equal(await auction.getUserErc20Deposit(2, alice), ether(11));
      });

      it('should allow depositing for a future period', async function () {
        await increaseTime(periodLength * 2);

        assert.equal(await auction.getCurrentPeriodId(), 1);
        await token.approve(auction.address, ether(8), { from: alice });
        await auction.depositErc20ForPeriod(3, ether(8), { from: alice });

        const res = await auction.periods(3);
        assert.equal(res.totalErc20Deposits, ether(8));
        assert.equal(res.totalEthDeposits, 0);
      });

      it('should deny depositing along with ETHs', async function () {
        await assertRevert(auction.depositErc20ForPeriod(3, ether(8), { value: 1, from: alice }));
      });

      it('should deny depositing for previous periods', async function () {
        await increaseTime(periodLength * 2);

        assert.equal(await auction.getCurrentPeriodId(), 1);
        await token.approve(auction.address, ether(3), { from: alice });
        await assertRevert(
          auction.depositErc20ForPeriod(0, ether(8), { from: alice }),
          'ERC20Auction: Period ID from the past'
        );
      });
    });

    describe('#depositErc20()', () => {
      it('should allow depositing for the current period', async function () {
        await increaseTime(periodLength * 2);

        assert.equal(await auction.getCurrentPeriodId(), 1);
        await token.approve(auction.address, ether(8), { from: alice });
        await auction.depositErc20(ether(8), { from: alice });

        const res = await auction.periods(1);
        assert.equal(res.totalErc20Deposits, ether(8));
      });

      it('should accumulate multiple deposits for the same period', async function () {
        await increaseTime(periodLength * 2);

        assert.equal(await auction.getCurrentPeriodId(), 1);

        await token.approve(auction.address, ether(8), { from: alice });
        await auction.depositErc20(ether(8), { from: alice });
        let res = await auction.periods(1);
        assert.equal(res.totalErc20Deposits, ether(8));
        assert.equal(await auction.getUserErc20Deposit(1, alice), ether(8));

        await token.approve(auction.address, ether(3), { from: alice });
        await auction.depositErc20(ether(3), { from: alice });
        res = await auction.periods(1);
        assert.equal(res.totalErc20Deposits, ether(11));
        assert.equal(await auction.getUserErc20Deposit(1, alice), ether(11));
      });

      it('should deny depositing along with ETHs', async function () {
        await assertRevert(auction.depositErc20(ether(8), { value: 1, from: alice }));
      });
    });

    describe('#claimEthForPeriod()', () => {
      beforeEach(async function () {
        await increaseTime(40);
        await token.approve(auction.address, ether(12), { from: alice });
        await auction.depositErc20ForPeriod(2, ether(12), { from: alice });
        await auction.depositEthForPeriod(2, { value: ether(24), from: bob });
        await increaseTime(periodLength * 2);
      });

      it('should allow a user with ERC20 deposit claiming ETH reward', async function () {
        await increaseTime(periodLength);
        assert.equal(await auction.getCurrentPeriodId(), 3);

        const expectedGross = new BN(ether(24));
        const expectedFee = expectedGross.mul(withdrawalFeeBN).div(hundredPctBN);
        const expectedNet = expectedGross.sub(expectedFee);

        const detailed = await auction.calculateEthReturn(2, alice);
        assert.equal(detailed.fee, expectedFee);
        assert.equal(detailed.net, expectedNet);
        assert.equal(await auction.calculateGrossEthReturn(2, alice), expectedGross);

        const aliceBalanceBefore = await web3.eth.getBalance(alice);
        const ownerRewardBefore = await auction.ownerEthReward();
        await auction.claimEthForPeriod(2, { from: alice });
        const aliceBalanceAfter = await web3.eth.getBalance(alice);
        const ownerRewardAfter = await auction.ownerEthReward();

        assertEthBalanceIncreased(aliceBalanceBefore, aliceBalanceAfter, expectedNet);
        // erc20 assertion since the increment is precise
        assertErc20BalanceIncreased(ownerRewardBefore, ownerRewardAfter, expectedFee);
      });

      it('should deny a user with ERC20 deposit claiming a reward for the current period', async function () {
        assert.equal(await auction.getCurrentPeriodId(), 2);

        await assertRevert(auction.claimEthForPeriod(2, { from: alice }), 'ERC20Auction: Period not finished yet');
      });

      it('should deny a user with ERC20 deposit claiming a reward for a future period', async function () {
        await token.approve(auction.address, ether(12), { from: alice });
        await auction.depositErc20ForPeriod(4, ether(12), { from: alice });
        await auction.depositEthForPeriod(4, { value: ether(24), from: bob });
        assert.equal(await auction.getCurrentPeriodId(), 2);

        await assertRevert(auction.claimEthForPeriod(4, { from: alice }), 'ERC20Auction: Period not finished yet');
      });

      it('should deny a user with ERC20 deposit claiming a reward twice', async function () {
        await increaseTime(periodLength);
        assert.equal(await auction.getCurrentPeriodId(), 3);

        await auction.claimEthForPeriod(2, { from: alice });
        await assertRevert(auction.claimEthForPeriod(2, { from: alice }), 'ERC20Auction: Already claimed');
      });

      it('should deny a user with ERC20 deposit claiming a reward when missing ETH deposits', async function () {
        await token.approve(auction.address, ether(12), { from: alice });
        await auction.depositErc20ForPeriod(4, ether(12), { from: alice });
        await increaseTime(periodLength * 3);
        assert.equal(await auction.getCurrentPeriodId(), 5);

        await assertRevert(auction.claimEthForPeriod(4, { from: alice }), 'ERC20Auction: Missing ETH deposits.');
      });

      it('should deny a user with no deposit claiming reward for a period', async function () {
        await increaseTime(periodLength);
        await assertRevert(
          auction.claimEthForPeriod(2, { from: charlie }),
          'ERC20Auction: Missing the user ERC20 deposit'
        );
      });
    });

    describe('#claimErc20ForPeriod()', () => {
      beforeEach(async function () {
        await increaseTime(40);
        await auction.depositEthForPeriod(2, { value: ether(24), from: alice });
        await token.approve(auction.address, ether(12), { from: bob });
        await auction.depositErc20ForPeriod(2, ether(12), { from: bob });
        await increaseTime(periodLength * 2);
      });

      it('should allow a user with ETH deposit claiming ERC20 reward', async function () {
        await increaseTime(periodLength);
        assert.equal(await auction.getCurrentPeriodId(), 3);

        const expectedGross = new BN(ether(12));
        const expectedFee = expectedGross.mul(withdrawalFeeBN).div(hundredPctBN);
        const expectedNet = expectedGross.sub(expectedFee);

        const detailed = await auction.calculateErc20Return(2, alice);
        assert.equal(detailed.fee, expectedFee);
        assert.equal(detailed.net, expectedNet);
        assert.equal(await auction.calculateGrossErc20Return(2, alice), expectedGross);

        const aliceBalanceBefore = await token.balanceOf(alice);
        const ownerRewardBefore = await auction.ownerErc20Reward();
        await auction.claimErc20ForPeriod(2, { from: alice });
        const aliceBalanceAfter = await token.balanceOf(alice);
        const ownerRewardAfter = await auction.ownerErc20Reward();

        assertErc20BalanceIncreased(aliceBalanceBefore, aliceBalanceAfter, expectedNet);
        assertErc20BalanceIncreased(ownerRewardBefore, ownerRewardAfter, expectedFee);
      });

      it('should deny a user with ETH deposit claiming a reward for the current period', async function () {
        assert.equal(await auction.getCurrentPeriodId(), 2);

        await assertRevert(auction.claimErc20ForPeriod(2, { from: alice }), 'ERC20Auction: Period not finished yet');
      });

      it('should deny a user with ETH deposit claiming a reward for a future period', async function () {
        await token.approve(auction.address, ether(12), { from: alice });
        await auction.depositErc20ForPeriod(4, ether(12), { from: alice });
        await auction.depositEthForPeriod(4, { value: ether(24), from: bob });
        assert.equal(await auction.getCurrentPeriodId(), 2);

        await assertRevert(auction.claimErc20ForPeriod(4, { from: alice }), 'ERC20Auction: Period not finished yet');
      });

      it('should deny a user with ETH deposit claiming a reward twice', async function () {
        await increaseTime(periodLength);
        assert.equal(await auction.getCurrentPeriodId(), 3);

        await auction.claimErc20ForPeriod(2, { from: alice });
        await assertRevert(auction.claimErc20ForPeriod(2, { from: alice }), 'ERC20Auction: Already claimed');
      });

      it('should deny a user with ETH deposit claiming a reward when missing ETH deposits', async function () {
        await token.approve(auction.address, ether(12), { from: alice });
        await auction.depositEthForPeriod(4, { value: ether(12), from: alice });
        await increaseTime(periodLength * 3);
        assert.equal(await auction.getCurrentPeriodId(), 5);

        await assertRevert(auction.claimErc20ForPeriod(4, { from: alice }), 'ERC20Auction: Missing ERC20 deposits.');
      });

      it('should deny a user with no ETH deposit claiming ERC20 reward for a period', async function () {
        await increaseTime(periodLength);
        await assertRevert(
          auction.claimErc20ForPeriod(2, { from: charlie }),
          'ERC20Auction: Missing the user ETH deposit'
        );
      });
    });
  });

  describe('#getCurrentPeriodId', () => {
    it('should revert before genesisTimestamp', async function () {
      assert((await now()) < (await auction.genesisTimestamp()));
      await assertRevert(auction.getCurrentPeriodId(), ' YALLDistributor: Contract not initiated yet');
    });

    it('should return 0th period just after genesis', async function () {
      await increaseTime(35);
      assert((await now()) > (await auction.genesisTimestamp()));
      assert((await now()) < (await auction.genesisTimestamp()) + periodLength);
      assert.equal(await auction.getCurrentPeriodId(), 0);
    });

    it('should return 1st period', async function () {
      await increaseTime(35 + periodLength);
      assert.isAbove(await now(), int(await auction.genesisTimestamp()) + periodLength);
      assert.isBelow(await now(), int(await auction.genesisTimestamp()) + periodLength * 2);
      assert.equal(await auction.getCurrentPeriodId(), 1);
    });
  });
});
