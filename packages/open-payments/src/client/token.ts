import { HttpMethod, ResponseValidator } from '@interledger/openapi'
import { GrantOrTokenRequestArgs, BaseDeps, RouteDeps } from '.'
import { getASPath, AccessToken } from '../types'
import { deleteRequest, post } from './requests'

export interface TokenRoutes {
  rotate(args: GrantOrTokenRequestArgs): Promise<AccessToken>
  revoke(args: GrantOrTokenRequestArgs): Promise<void>
}

export const createTokenRoutes = (deps: RouteDeps): TokenRoutes => {
  const { openApi, ...baseDeps } = deps

  let rotateTokenValidator: ResponseValidator<AccessToken>
  let revokeTokenValidator: ResponseValidator<void>

  if (deps.validateResponses) {
    rotateTokenValidator = openApi.createResponseValidator({
      path: getASPath('/token/{id}'),
      method: HttpMethod.POST
    })

    revokeTokenValidator = openApi.createResponseValidator({
      path: getASPath('/token/{id}'),
      method: HttpMethod.DELETE
    })
  }

  return {
    rotate: (args: GrantOrTokenRequestArgs) =>
      rotateToken(baseDeps, args, rotateTokenValidator),
    revoke: (args: GrantOrTokenRequestArgs) =>
      revokeToken(baseDeps, args, revokeTokenValidator)
  }
}

export const rotateToken = async (
  deps: BaseDeps,
  args: GrantOrTokenRequestArgs,
  validateOpenApiResponse: ResponseValidator<AccessToken>
) => {
  const { url, accessToken } = args

  return post(
    deps,
    {
      url,
      accessToken
    },
    validateOpenApiResponse
  )
}

export const revokeToken = async (
  deps: BaseDeps,
  args: GrantOrTokenRequestArgs,
  validateOpenApiResponse: ResponseValidator<void>
) => {
  const { url, accessToken } = args

  return deleteRequest(
    deps,
    {
      url,
      accessToken
    },
    validateOpenApiResponse
  )
}
