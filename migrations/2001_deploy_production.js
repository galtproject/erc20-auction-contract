const { now } = require('@galtproject/solidity-test-chest')(web3);

const ERC20Auction = artifacts.require('ERC20Auction');

module.exports = async function (truffle, network) {
  if (network === 'test' || network === 'soliditycoverage') {
    console.log('Skipping deployment migration');
    return;
  }

  await truffle;

  // INPUTS
  const startAfterSeconds = 10;
  const genesisTimestamp = (await now()) + startAfterSeconds;
  const periodLength = 3600;
  const erc20TokenAddress = '0x4B674Be863b1F2b744DE27D8856dc3ea782aAD02';

  console.log('>>> Deploying an auction contract');
  const auction = await truffle.deploy(ERC20Auction, genesisTimestamp, periodLength, erc20TokenAddress);
  console.log('>>> Deployed at', auction.address);
};
