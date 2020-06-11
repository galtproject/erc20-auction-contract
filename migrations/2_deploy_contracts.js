const MyContract = artifacts.require('MyContract');

module.exports = async function(deployer) {
  await deployer.deploy(MyContract);
};
