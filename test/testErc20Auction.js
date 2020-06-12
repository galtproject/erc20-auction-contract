// eslint-disable-next-line no-unused-vars
const { accounts, defaultSender } = require('@openzeppelin/test-environment');
const { assert } = require('chai');
const { contract } = require('./twrapper');
// eslint-disable-next-line import/order
const { ether, now, assertRevert, increaseTime, int } = require('@galtproject/solidity-test-chest')(web3);

const ERC20Mintable = contract.fromArtifact('ERC20Mintable');
const ERC20Auction = contract.fromArtifact('ERC20Auction');

describe('ERC20Auction', () => {
  const [alice] = accounts;

  let auction;
  let token;
  let genesisTimestamp;
  let periodLength;
  let startAfter;

  before(async function () {
    token = await ERC20Mintable.new();
    await token.mint(alice, ether(200));

    startAfter = 30;
    genesisTimestamp = (await now()) + startAfter;
    periodLength = 3600;
  });

  beforeEach(async function () {
    auction = await ERC20Auction.new(genesisTimestamp, periodLength, token.address);
  });

  it('should store constructor arguments', async function () {
    assert.equal(await auction.genesisTimestamp(), genesisTimestamp);
    assert.equal(await auction.periodLength(), periodLength);
    assert.equal(await auction.erc20Token(), token.address);
    assert.equal(await auction.owner(), defaultSender);
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
