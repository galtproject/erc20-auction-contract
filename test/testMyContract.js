// eslint-disable-next-line no-unused-vars
const { accounts, defaultSender } = require('@openzeppelin/test-environment');
const { assert } = require('chai');
// eslint-disable-next-line import/order
const { contract } = require('./twrapper');

const MyContract = contract.fromArtifact('MyContract');

describe('MyContract', () => {
  const [alice, bob, charlie] = accounts;

  describe('#foo() method', () => {
    it('should return foo', async function () {
      const myContract = await MyContract.new({ from: alice });

      assert.equal(await myContract.foo(), 'foo', { from: bob });
      assert.equal(await myContract.balance(), 0, { from: charlie });
    });
  });
});
