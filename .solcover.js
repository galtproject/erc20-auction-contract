module.exports = {
    testrpcOptions: '-p 8555 -e 500000000 -a 35',
    skipFiles: [
        'Migrations.sol',
    ],
    compileCommand: 'npm run compile',
    testCommand: 'npm run test',
};
