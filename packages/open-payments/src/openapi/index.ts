import { createOpenAPI } from '@interledger/openapi'
import resourceServerSpec from '../openapi/generated/schemas/resource-server'
import walletAddressServerSpec from '../openapi/generated/schemas/wallet-address-server'
import authServerSpec from '../openapi/generated/schemas/auth-server'

/**
 * Returns the OpenAPI object for the Open Payments Resource Server OpenAPI spec.
 * This object allows validating requests and responses against the spec.
 * See more: https://github.com/interledger/open-payments/blob/main/packages/openapi/README.md
 */
export async function getResourceServerOpenAPI() {
  return createOpenAPI(resourceServerSpec)
}

/**
 * Returns the OpenAPI object for the Open Payments Wallet Address Server OpenAPI spec.
 * This object allows validating requests and responses against the spec.
 * See more: https://github.com/interledger/open-payments/blob/main/packages/openapi/README.md
 */
export async function getWalletAddressServerOpenAPI() {
  return createOpenAPI(walletAddressServerSpec)
}

/**
 * Returns the OpenAPI object for the Open Payments Auth Server OpenAPI spec.
 * This object allows validating requests and responses against the spec.
 * See more: https://github.com/interledger/open-payments/blob/main/packages/openapi/README.md
 */
export async function getAuthServerOpenAPI() {
  return createOpenAPI(authServerSpec)
}
