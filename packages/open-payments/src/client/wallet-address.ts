import { HttpMethod, ResponseValidator } from '@interledger/openapi'
import { RouteDeps, UnauthenticatedResourceRequestArgs } from '.'
import { JWKS, WalletAddress, DIDDocument, getWAPath } from '../types'
import { get } from './requests'

export interface WalletAddressRoutes {
  get(args: UnauthenticatedResourceRequestArgs): Promise<WalletAddress>
  getKeys(args: UnauthenticatedResourceRequestArgs): Promise<JWKS>
  // TODO: Define schema for DID Document
  getDIDDocument(args: UnauthenticatedResourceRequestArgs): Promise<DIDDocument>
}

export const createWalletAddressRoutes = (
  deps: RouteDeps
): WalletAddressRoutes => {
  const { openApi, ...baseDeps } = deps

  let getWalletAddressValidator: ResponseValidator<WalletAddress>
  let getWalletAddressKeysValidator: ResponseValidator<JWKS>
  let getDidDocumentValidator: ResponseValidator<DIDDocument>

  if (deps.validateResponses) {
    getWalletAddressValidator = openApi.createResponseValidator({
      path: getWAPath('/'),
      method: HttpMethod.GET
    })

    getWalletAddressKeysValidator = openApi.createResponseValidator({
      path: getWAPath('/jwks.json'),
      method: HttpMethod.GET
    })

    getDidDocumentValidator = openApi.createResponseValidator({
      path: getWAPath('/did.json'),
      method: HttpMethod.GET
    })
  }

  return {
    get: (args: UnauthenticatedResourceRequestArgs) =>
      get(baseDeps, args, getWalletAddressValidator),
    getKeys: (args: UnauthenticatedResourceRequestArgs) =>
      get(
        baseDeps,
        {
          url: `${args.url}/jwks.json`
        },
        getWalletAddressKeysValidator
      ),
    getDIDDocument: (args: UnauthenticatedResourceRequestArgs) =>
      get(
        baseDeps,
        {
          url: `${args.url}/did.json`
        },
        getDidDocumentValidator
      )
  }
}
