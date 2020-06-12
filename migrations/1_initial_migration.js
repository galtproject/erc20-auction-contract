const Migrations = artifacts.require('Migrations');

module.exports = function (deployer, network) {
  if (network === 'test' || network === 'soliditycoverage') {
    console.log('Skipping deployment migration');
    return;
  }
  deployer.deploy(Migrations);
};
