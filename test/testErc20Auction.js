// eslint-disable-next-line no-unused-vars
const { accounts, defaultSender } = require('@openzeppelin/test-environment');
const { assert } = require('chai');
const { contract } = require('./twrapper');
// eslint-disable-next-line import/order
const { ether, now, assertRevert, increaseTime, int } = require('@galtproject/solidity-test-chest')(web3);

const ERC20Mintable = contract.fromArtifact('ERC20Mintable');
const ERC20Auction = contract.fromArtifact('ERC20Auction');

ERC20Mintable.numberFormat = 'String';
ERC20Auction.numberFormat = 'String';

describe('ERC20Auction', () => {
  const [alice] = accounts;

  let auction;
  let token;
  let genesisTimestamp;
  let periodLength;
  let startAfter;
  let withdrawalFee;

  before(async function () {
    token = await ERC20Mintable.new();
    await token.mint(alice, ether(200));

    startAfter = 30;
    withdrawalFee = 12;
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
