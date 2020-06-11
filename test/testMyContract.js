// eslint-disable-next-line no-unused-vars
const { accounts, defaultSender, contract, web3 } = require('@openzeppelin/test-environment');
const { assert } = require('chai');

const MyContract = contract.fromArtifact('MyContract');

describe('MyContract', () => {
  const [alice, bob, charlie] = accounts;

  describe('#foo() method', () => {
    it('should return foo', async function() {
      const myContract = await MyContract.new({ from: alice });

      assert.equal(await myContract.foo(), 'foo', { from: bob });
      assert.equal(await myContract.balance(), 0, { from: charlie });
    });
  });
});
