const { now, ether } = require('@galtproject/solidity-test-chest')(web3);

const ERC20Auction = artifacts.require('ERC20Auction');
const ERC20Mintable = artifacts.require('ERC20Mintable');

module.exports = async function (truffle, network, accounts) {
  if (network === 'test' || network === 'soliditycoverage') {
    console.log('Skipping deployment migration');
    return;
  }

  await truffle;

  // INPUTS
  const startAfterSeconds = 10;
  const genesisTimestamp = (await now()) + startAfterSeconds;
  const periodLength = 3600;

  console.log('>>> Deploying a demo ERC20 token');
  const token = await truffle.deploy(ERC20Mintable);
  await token.mint(accounts[0], ether(200));

  console.log('>>> Deploying an auction contract');
  await truffle.deploy(ERC20Auction, genesisTimestamp, periodLength, token.address);
};
