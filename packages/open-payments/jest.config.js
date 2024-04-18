'use strict'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const baseConfig = require('../../jest.config.base.js')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const packageName = 'open-payments'

const esModules = ['ky']

module.exports = {
  ...baseConfig,
  clearMocks: true,
  roots: [`<rootDir>/packages/${packageName}`],
  testRegex: `(packages/${packageName}/.*/__tests__/.*|\\.(test|spec))\\.tsx?$`,
  moduleDirectories: [`node_modules`, `packages/${packageName}/node_modules`],
  modulePaths: [`<rootDir>/packages/${packageName}/src/`],
  id: packageName,
  displayName: packageName,
  rootDir: '../..',
  transformIgnorePatterns: [`node_modules/(?!.pnpm|${esModules.join('|')})`]
}
