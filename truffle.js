const coverage = process.env.OZ_TEST_ENV_COVERAGE !== undefined;

const config = {
  networks: {
    local: {
      host: '127.0.0.1',
      port: 8545,
      gasLimit: 9700000,
      network_id: '*',
    },
    coverage: {
      host: '127.0.0.1',
      port: 8555,
      gasLimit: 9600000,
      network_id: '*',
    },
  },
  compilers: {
    solc: {
      version: 'native',
      settings: {
        optimizer: {
          enabled: !coverage,
          runs: coverage ? 0 : 200,
        },
      },
      evmVersion: coverage ? 'petersburg' : 'istanbul',
    },
  },
};

module.exports = config;
