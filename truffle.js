const config = {
  networks: {
    local: {
      host: '127.0.0.1',
      port: 8545,
      gasLimit: 9700000,
      network_id: '*',
    },
    soliditycoverage: {
      host: '127.0.0.1',
      port: 8555,
      gasLimit: 9600000,
      network_id: '*',
    },
    test: {
      // https://github.com/trufflesuite/ganache-core#usage
      provider() {
        // eslint-disable-next-line global-require
        const { provider } = require('@openzeppelin/test-environment');
        return provider;
      },
      skipDryRun: true,
      network_id: '*',
    },
  },
  compilers: {
    solc: {
      version: 'native',
      settings: {
        optimizer: {
          enabled: true,
          runs: 200,
        },
      },
      evmVersion: 'istanbul',
    },
  },
  plugins: ['solidity-coverage'],
};

module.exports = config;
