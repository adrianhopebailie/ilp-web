/* eslint-disable @typescript-eslint/no-var-requires */

/**
 * This script parses the Open Payments YAML OpenAPI specs into JS schema objects that can be used
 * in the @interledger/openapi validator middleware for validating requests and responses.
 */

const { $RefParser } = require('@interledger/openapi')
const path = require('path')
const fs = require('fs')
const util = require('util')

;(async () => {
  const specFileNames = [
    'resource-server',
    'auth-server',
    'wallet-address-server'
  ]

  for (const fileName of specFileNames) {
    const outputFilePath = path.resolve(
      __dirname,
      `../src/openapi/generated/schemas/${fileName}.ts`
    )

    fs.truncateSync(outputFilePath)
    fs.appendFileSync(
      outputFilePath,
      `/**
      * This file was auto-generated by generate-schema-objects.js.
      * Do not make direct changes to the file.
      */
      
      import { OpenAPIV3_1 } from "@interledger/openapi"\n\n`
    )

    const parsedSchemaObject = await $RefParser.dereference(
      path.resolve(__dirname, `../../../openapi/${fileName}.yaml`)
    )

    fs.appendFileSync(
      outputFilePath,
      `export default 
        ${util.inspect(parsedSchemaObject, {
          showHidden: false,
          compact: false,
          depth: null
        })} as OpenAPIV3_1.Document\n`
    )
  }
})()
