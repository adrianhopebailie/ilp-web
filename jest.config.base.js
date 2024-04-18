'use strict'

module.exports = {
  transform: {
    '^.+\\.(t|j)sx?$': ['@swc/jest']
  },
  testEnvironment: 'node',
  moduleDirectories: ['node_modules', './'],
  modulePaths: ['node_modules', './']
}
