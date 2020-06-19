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
  int,
  assertErc20BalanceChanged,
  assertEthBalanceChanged,
  // eslint-disable-next-line import/order
} = require('@galtproject/solidity-test-chest')(web3);

const { BN } = web3.utils;

const ERC20Mintable = contract.fromArtifact('ERC20Mintable');
const ERC20Auction = contract.fromArtifact('ERC20Auction');

ERC20Mintable.numberFormat = 'String';
ERC20Auction.numberFormat = 'String';

function assertEthBalanceIncreased(balanceBefore, balanceAfter, expectedValue) {
  return assertEthBalanceChanged(balanceBefore, balanceAfter, expectedValue);
}

function assertErc20BalanceIncreased(balanceBefore, balanceAfter, expectedValue) {
  return assertErc20BalanceChanged(balanceBefore, balanceAfter, expectedValue);
}

describe('ERC20Auction', () => {
  const [owner, beneficiary, alice, bob, charlie] = accounts;

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
    await token.mint(charlie, ether(2000000));

    startAfter = 30;
    withdrawalFee = ether(12);
    withdrawalFeeBN = new BN(withdrawalFee);
    periodLength = 3600;
  });

  beforeEach(async function () {
    genesisTimestamp = (await now()) + startAfter;
    auction = await ERC20Auction.new(genesisTimestamp, periodLength, withdrawalFee, token.address, { from: owner });
  });

  it('should store constructor arguments', async function () {
    assert.equal(await auction.genesisTimestamp(), genesisTimestamp);
    assert.equal(await auction.periodLength(), periodLength);
    assert.equal(await auction.withdrawalFee(), withdrawalFee);
    assert.equal(await auction.erc20Token(), token.address);
    assert.equal(await auction.owner(), owner);
  });

  describe('Owner Interface', () => {
    describe('reward claiming', () => {
      beforeEach(async function () {
        await increaseTime(40);
        // total ERC20 deposit - 70
        await token.approve(auction.address, ether(20), { from: alice });
        await auction.depositErc20ForPeriod(2, ether(20), { from: alice });
        await token.approve(auction.address, ether(30), { from: bob });
        await auction.depositErc20ForPeriod(2, ether(30), { from: bob });
        await token.approve(auction.address, ether(20), { from: charlie });
        await auction.depositErc20ForPeriod(2, ether(20), { from: charlie });

        // total ETH deposit - 30
        await auction.depositEthForPeriod(2, { value: ether(24), from: bob });
        await auction.depositEthForPeriod(2, { value: ether(6), from: charlie });

        await increaseTime(periodLength * 3);

        await auction.claimEthForPeriod(2, { from: alice });
        await auction.claimEthForPeriod(2, { from: bob });
        await auction.claimEthForPeriod(2, { from: charlie });
        await auction.claimErc20ForPeriod(2, { from: bob });
        await auction.claimErc20ForPeriod(2, { from: charlie });
      });

      describe('withdrawOwnerEthReward()', () => {
        it('should transfer all ETH owner reward to a sepecified beneficiary', async function () {
          // an error due two floor roundings, 1 wei is stuck on the contract
          const expectedOwnerEthReward = new BN('3599999999999999999');

          assert.equal(await auction.ownerEthReward(), expectedOwnerEthReward.toString());

          const beneficiaryBalanceBefore = await web3.eth.getBalance(beneficiary);
          await auction.withdrawOwnerEthReward(beneficiary, { from: owner });
          const beneficiaryBalanceAfter = await web3.eth.getBalance(beneficiary);

          assert.equal(await auction.ownerEthReward(), 0);

          assertErc20BalanceIncreased(
            beneficiaryBalanceBefore,
            beneficiaryBalanceAfter,
            expectedOwnerEthReward.toString(10)
          );
        });

        it('should deny non owner claiming ETH reward', async function () {
          await assertRevert(
            auction.withdrawOwnerEthReward(beneficiary, { from: alice }),
            ' Ownable: caller is not the owner'
          );
        });
      });

      describe('withdrawOwnerEthReward()', () => {
        it('should transfer all ERC20 owner reward to a specified beneficiary', async function () {
          const totalERC20 = new BN(ether('70'));

          // no errors due floor roundings
          const expectedOwnerERC20Reward = totalERC20.mul(withdrawalFeeBN).div(hundredPctBN);

          assert.equal(await auction.ownerErc20Reward(), expectedOwnerERC20Reward.toString());

          const beneficiaryBalanceBefore = await token.balanceOf(beneficiary);
          await auction.withdrawOwnerErc20Reward(beneficiary, { from: owner });
          const beneficiaryBalanceAfter = await token.balanceOf(beneficiary);

          assert.equal(await auction.ownerErc20Reward(), 0);

          assertErc20BalanceIncreased(beneficiaryBalanceBefore, beneficiaryBalanceAfter, expectedOwnerERC20Reward);
        });

        it('should deny non owner claiming ERC20 reward', async function () {
          await assertRevert(
            auction.withdrawOwnerErc20Reward(beneficiary, { from: alice }),
            ' Ownable: caller is not the owner'
          );
        });
      });
    });

    describe('stopping a contract', () => {
      it('should allow an owner stopping the contract', async function () {
        await auction.stop({ from: owner });
        assert.equal(await auction.stopped(), true);
      });

      it('should deny an owner stopping the contract twice', async function () {
        await auction.stop({ from: owner });
        await assertRevert(auction.stop({ from: owner }), 'ERC20Auction: The contract is stopped');
      });

      it('should deny non-owner stopping the contract twice', async function () {
        await assertRevert(auction.stop({ from: alice }), 'Ownable: caller is not the owner');
      });
    });
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
        assert.equal(await auction.getUserEthDepositForPeriod(2, alice), 8);

        await auction.depositEthForPeriod(2, { value: 3, from: alice });
        res = await auction.periods(2);
        assert.equal(res.totalEthDeposits, 11);
        assert.equal(await auction.getUserEthDepositForPeriod(2, alice), 11);
      });

      it('should allow depositing for a future period', async function () {
        await increaseTime(periodLength * 2);

        assert.equal(await auction.getCurrentPeriodId(), 1);
        await auction.depositEthForPeriod(3, { value: 8, from: alice });

        const res = await auction.periods(3);
        assert.equal(res.totalEthDeposits, 8);
        assert.equal(res.totalErc20Deposits, 0);
      });

      it('should allow depositing 0 value', async function () {
        await increaseTime(periodLength * 2);

        assert.equal(await auction.getCurrentPeriodId(), 1);
        await assertRevert(
          auction.depositEthForPeriod(3, { value: 0, from: alice }),
          'ERC20Auction: Missing a deposit'
        );
      });

      it('should deny depositing for previous periods', async function () {
        await increaseTime(periodLength * 2);

        assert.equal(await auction.getCurrentPeriodId(), 1);
        await assertRevert(
          auction.depositEthForPeriod(0, { value: 10, from: alice }),
          'ERC20Auction: Period ID from the past'
        );
      });

      it('should deny depositing if the contract is stopped', async function () {
        await auction.stop({ from: owner });
        await assertRevert(
          auction.depositEthForPeriod(0, { value: 10, from: alice }),
          'ERC20Auction: The contract is stopped'
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
        assert.equal(await auction.getUserEthDepositForPeriod(1, alice), 8);
      });

      it('should accumulate multiple deposits for the same period', async function () {
        await increaseTime(periodLength * 3);

        assert.equal(await auction.getCurrentPeriodId(), 2);

        await auction.depositEth({ value: 8, from: alice });
        let res = await auction.periods(2);
        assert.equal(res.totalEthDeposits, 8);
        assert.equal(await auction.getUserEthDepositForPeriod(2, alice), 8);

        await auction.depositEth({ value: 3, from: alice });
        res = await auction.periods(2);
        assert.equal(res.totalEthDeposits, 11);
        assert.equal(await auction.getUserEthDepositForPeriod(2, alice), 11);
      });

      it('should deny depositing if the contract is stopped', async function () {
        await increaseTime(periodLength * 3);
        await auction.stop({ from: owner });
        await assertRevert(auction.depositEth({ value: 10, from: alice }), 'ERC20Auction: The contract is stopped');
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
        assert.equal(await auction.getUserErc20DepositForPeriod(2, alice), ether(8));

        await token.approve(auction.address, ether(3), { from: alice });
        await auction.depositErc20ForPeriod(2, ether(3), { from: alice });
        res = await auction.periods(2);
        assert.equal(res.totalErc20Deposits, ether(11));
        assert.equal(await auction.getUserErc20DepositForPeriod(2, alice), ether(11));
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

      it('should deny depositing 0 value', async function () {
        await increaseTime(periodLength * 2);
        await assertRevert(auction.depositErc20ForPeriod(3, 0, { from: alice }), 'ERC20Auction: Missing a deposit');
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

      it('should deny depositing if the contract is stopped', async function () {
        await increaseTime(periodLength);
        await auction.stop({ from: owner });
        await token.approve(auction.address, ether(3), { from: alice });
        await assertRevert(
          auction.depositErc20ForPeriod(2, ether(3), { from: alice }),
          'ERC20Auction: The contract is stopped'
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
        assert.equal(await auction.getUserErc20DepositForPeriod(1, alice), ether(8));

        await token.approve(auction.address, ether(3), { from: alice });
        await auction.depositErc20(ether(3), { from: alice });
        res = await auction.periods(1);
        assert.equal(res.totalErc20Deposits, ether(11));
        assert.equal(await auction.getUserErc20DepositForPeriod(1, alice), ether(11));
      });

      it('should deny depositing along with ETHs', async function () {
        await assertRevert(auction.depositErc20(ether(8), { value: 1, from: alice }));
      });

      it('should deny depositing if the contract is stopped', async function () {
        await increaseTime(periodLength);
        await auction.stop({ from: owner });
        await token.approve(auction.address, ether(3), { from: alice });
        await assertRevert(auction.depositErc20(ether(3), { from: alice }), 'ERC20Auction: The contract is stopped');
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

      it('should not charge 0 fee', async function () {
        auction = await ERC20Auction.new(genesisTimestamp, periodLength, 0, token.address, { from: owner });
        await token.approve(auction.address, ether(12), { from: alice });
        await auction.depositErc20ForPeriod(2, ether(12), { from: alice });
        await auction.depositEthForPeriod(2, { value: ether(24), from: bob });
        await increaseTime(periodLength);
        assert.equal(await auction.getCurrentPeriodId(), 3);

        const expectedGross = new BN(ether(24));

        const detailed = await auction.calculateEthReturn(2, alice);
        assert.equal(detailed.fee, 0);
        assert.equal(detailed.net, expectedGross);
        assert.equal(await auction.calculateGrossEthReturn(2, alice), expectedGross);

        const aliceBalanceBefore = await web3.eth.getBalance(alice);
        const ownerRewardBefore = await auction.ownerEthReward();
        await auction.claimEthForPeriod(2, { from: alice });
        const aliceBalanceAfter = await web3.eth.getBalance(alice);
        const ownerRewardAfter = await auction.ownerEthReward();

        assertEthBalanceIncreased(aliceBalanceBefore, aliceBalanceAfter, expectedGross);
        // erc20 assertion since the increment is precise
        assertErc20BalanceIncreased(ownerRewardBefore, ownerRewardAfter, '0');
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

      it('should not deny claiming when stopped', async function () {
        await increaseTime(periodLength);
        await auction.stop({ from: owner });
        await auction.claimEthForPeriod(2, { from: alice });
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

      it('should not charge 0 fee', async function () {
        auction = await ERC20Auction.new(genesisTimestamp, periodLength, 0, token.address, { from: owner });

        await auction.depositEthForPeriod(2, { value: ether(24), from: alice });
        await token.approve(auction.address, ether(12), { from: bob });
        await auction.depositErc20ForPeriod(2, ether(12), { from: bob });

        await increaseTime(periodLength);
        assert.equal(await auction.getCurrentPeriodId(), 3);

        const expectedGross = new BN(ether(12));

        const detailed = await auction.calculateErc20Return(2, alice);
        assert.equal(detailed.fee, 0);
        assert.equal(detailed.net, expectedGross);
        assert.equal(await auction.calculateGrossErc20Return(2, alice), expectedGross);

        const aliceBalanceBefore = await token.balanceOf(alice);
        const ownerRewardBefore = await auction.ownerErc20Reward();
        await auction.claimErc20ForPeriod(2, { from: alice });
        const aliceBalanceAfter = await token.balanceOf(alice);
        const ownerRewardAfter = await auction.ownerErc20Reward();

        assertErc20BalanceIncreased(aliceBalanceBefore, aliceBalanceAfter, expectedGross);
        assertErc20BalanceIncreased(ownerRewardBefore, ownerRewardAfter, '0');
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

      it('should not deny claiming when stopped', async function () {
        await increaseTime(periodLength);
        await auction.stop({ from: owner });
        await auction.claimErc20ForPeriod(2, { from: alice });
      });
    });

    describe('#withdrawEthForPeriod', () => {
      beforeEach(async function () {
        await increaseTime(40);
        await token.approve(auction.address, ether(12), { from: alice });
        await auction.depositErc20ForPeriod(2, ether(12), { from: alice });
        await auction.depositEthForPeriod(2, { value: ether(24), from: bob });
        await increaseTime(periodLength);
      });

      it('should allow withdrawing eth for the stopped period in the future', async function () {
        await auction.stop({ from: owner });
        assert.equal(await auction.getCurrentPeriodId(), 1);

        assert.equal(await auction.getUserEthDepositForPeriod(2, bob), ether(24));
        assert.equal(await auction.getPeriodTotalEthDeposits(2), ether(24));

        assert.equal(await auction.isUserErc20PayoutClaimed(2, bob), false);
        assert.equal(await auction.isUserEthDepositWithdrawn(2, bob), false);

        const bobBalanceBefore = await web3.eth.getBalance(bob);
        await auction.withdrawEthDepositForPeriod(2, { from: bob });
        const bobBalanceAfter = await web3.eth.getBalance(bob);

        assert.equal(await auction.getUserEthDepositForPeriod(2, bob), 0);
        assert.equal(await auction.getPeriodTotalEthDeposits(2), 0);

        assert.equal(await auction.isUserErc20PayoutClaimed(2, bob), false);
        assert.equal(await auction.isUserEthDepositWithdrawn(2, bob), true);

        assertEthBalanceIncreased(bobBalanceBefore, bobBalanceAfter, ether(24));
      });

      it('should deny withdrawing eth when the stopped period in the past', async function () {
        await increaseTime(periodLength * 2);
        await auction.stop({ from: owner });
        assert.equal(await auction.getCurrentPeriodId(), 3);
        await assertRevert(
          auction.withdrawEthDepositForPeriod(2, { from: bob }),
          'Neither stopped nor 0 ERC20 deposit for the period'
        );
      });

      it('should deny withdrawing eth if the user has no eth deposit', async function () {
        await auction.stop({ from: owner });
        await assertRevert(
          auction.withdrawEthDepositForPeriod(2, { from: charlie }),
          'ERC20Auction: Missing user ETH deposit'
        );
      });

      it('should deny withdrawing eth twice', async function () {
        await auction.stop({ from: owner });
        assert.equal(await auction.getCurrentPeriodId(), 1);
        await auction.withdrawEthDepositForPeriod(2, { from: bob });
        await assertRevert(
          auction.withdrawEthDepositForPeriod(2, { from: bob }),
          'ERC20Auction: ETH deposit was already withdrawn'
        );
      });

      it('should allow withdrawing eth when there is no erc20 deposit for a period in the past', async function () {
        await auction.depositEthForPeriod(3, { value: ether(3), from: alice });

        await increaseTime(periodLength * 3);

        assert.equal(await auction.getCurrentPeriodId(), 4);
        await auction.withdrawEthDepositForPeriod(3, { from: alice });
      });

      it('should deny withdrawing eth when there is no erc20 deposit for a current period', async function () {
        await auction.depositEthForPeriod(3, { value: ether(30), from: alice });

        await increaseTime(periodLength * 2);

        assert.equal(await auction.getCurrentPeriodId(), 3);
        await assertRevert(
          auction.withdrawEthDepositForPeriod(3, { from: alice }),
          'ERC20Auction: Neither stopped nor 0 ERC20 deposit for the period'
        );
      });

      it('should deny withdrawing eth if not stopped', async function () {
        assert.equal(await auction.getCurrentPeriodId(), 1);

        await assertRevert(
          auction.withdrawEthDepositForPeriod(2, { from: bob }),
          'ERC20Auction: Neither stopped nor 0 ERC20 deposit for the period'
        );
      });
    });

    describe('#withdrawErc20ForPeriod', () => {
      beforeEach(async function () {
        await increaseTime(40);
        await token.approve(auction.address, ether(12), { from: alice });
        await auction.depositErc20ForPeriod(2, ether(12), { from: alice });
        await auction.depositEthForPeriod(2, { value: ether(24), from: bob });
        await increaseTime(periodLength);
      });

      it('should allow withdrawing erc20 when the stopped period in the future', async function () {
        await auction.stop({ from: owner });
        assert.equal(await auction.getCurrentPeriodId(), 1);

        assert.equal(await auction.getUserErc20DepositForPeriod(2, alice), ether(12));
        assert.equal(await auction.getPeriodTotalErc20Deposits(2), ether(12));

        assert.equal(await auction.isUserEthPayoutClaimed(2, alice), false);
        assert.equal(await auction.isUserErc20DepositWithdrawn(2, alice), false);

        const aliceBalanceBefore = await token.balanceOf(alice);
        await auction.withdrawErc20DepositForPeriod(2, { from: alice });
        const aliceBalanceAfter = await token.balanceOf(alice);

        assert.equal(await auction.getUserErc20DepositForPeriod(2, alice), 0);
        assert.equal(await auction.getPeriodTotalErc20Deposits(2), 0);

        assert.equal(await auction.isUserEthPayoutClaimed(2, alice), false);
        assert.equal(await auction.isUserErc20DepositWithdrawn(2, alice), true);

        assertErc20BalanceIncreased(aliceBalanceBefore, aliceBalanceAfter, ether(12));
      });

      it('should deny withdrawing erc20 when the stopped period in the past', async function () {
        await increaseTime(periodLength * 2);
        await auction.stop({ from: owner });
        assert.equal(await auction.getCurrentPeriodId(), 3);
        await assertRevert(
          auction.withdrawErc20DepositForPeriod(2, { from: alice }),
          'ERC20Auction: Neither stopped nor 0 ETH deposit for the period'
        );
      });

      it('should deny withdrawing erc20 when there is no user eth deposit for the given period', async function () {
        await token.approve(auction.address, ether(12), { from: alice });
        await auction.depositErc20ForPeriod(3, ether(12), { from: alice });

        await increaseTime(periodLength * 2);

        assert.equal(await auction.getCurrentPeriodId(), 3);
        await assertRevert(
          auction.withdrawErc20DepositForPeriod(3, { from: alice }),
          'ERC20Auction: Neither stopped nor 0 ETH deposit for the period'
        );
      });

      it('should deny withdrawing erc20 if there is no eth deposit', async function () {
        await auction.stop({ from: owner });
        await assertRevert(
          auction.withdrawErc20DepositForPeriod(2, { from: charlie }),
          'ERC20Auction: Missing user ERC20 deposit'
        );
      });

      it('should deny withdrawing erc20 twice', async function () {
        await auction.stop({ from: owner });
        assert.equal(await auction.getCurrentPeriodId(), 1);
        await auction.withdrawErc20DepositForPeriod(2, { from: alice });
        await assertRevert(
          auction.withdrawErc20DepositForPeriod(2, { from: alice }),
          'ERC20Auction: ERC20 deposit was already withdrawn'
        );
      });

      it('should deny withdrawing erc20 if not stopped', async function () {
        await increaseTime(periodLength * 2);
        assert.equal(await auction.getCurrentPeriodId(), 3);

        await assertRevert(
          auction.withdrawErc20DepositForPeriod(2, { from: alice }),
          'ERC20Auction: Neither stopped nor 0 ETH deposit for the period'
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
