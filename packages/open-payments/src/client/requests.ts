import { KeyObject } from 'crypto'
import { ResponseValidator, isValidationError } from '@interledger/openapi'
import { BaseDeps } from '.'
import { createHeaders } from '@interledger/http-signature-utils'
import { OpenPaymentsClientError } from './error'
import ky, { HTTPError, KyInstance } from 'ky'

interface GetArgs {
  url: string
  queryParams?: Record<string, string | number | undefined>
  accessToken?: string
}

interface PostArgs<T = undefined> {
  url: string
  body?: T
  accessToken?: string
}

interface DeleteArgs {
  url: string
  accessToken?: string
}

function parseAndRemoveEmptyValuesFromObject(
  obj: Record<string, string | number | undefined>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([_, v]) => v != null)
      .map(([key, value]) => [key, value?.toString()])
  ) as Record<string, string>
}

export const get = async <T>(
  deps: BaseDeps,
  args: GetArgs,
  openApiResponseValidator?: ResponseValidator<T>
): Promise<T> => {
  const { httpClient } = deps
  const { accessToken } = args

  try {
    let url = checkUrlProtocol(deps, args.url)

    if (args.queryParams) {
      const parsedParams = parseAndRemoveEmptyValuesFromObject(args.queryParams)
      url += `?${new URLSearchParams(parsedParams)}`
    }

    const response = await httpClient.get(url, {
      headers: accessToken
        ? {
            Authorization: `GNAP ${accessToken}`
          }
        : {}
    })

    const responseBody = await response.json<T>()

    if (openApiResponseValidator) {
      openApiResponseValidator({
        status: response.status,
        body: responseBody
      })
    }

    return responseBody
  } catch (error) {
    return handleError(deps, error, 'GET')
  }
}

export const post = async <TRequest, TResponse>(
  deps: BaseDeps,
  args: PostArgs<TRequest>,
  openApiResponseValidator?: ResponseValidator<TResponse>
): Promise<TResponse> => {
  const { httpClient } = deps
  const { body, accessToken } = args

  const url = checkUrlProtocol(deps, args.url)

  try {
    const response = await httpClient.post(url, {
      json: body,
      headers: accessToken
        ? {
            Authorization: `GNAP ${accessToken}`
          }
        : {}
    })

    const responseBody = await response.json<TResponse>()

    if (openApiResponseValidator) {
      openApiResponseValidator({
        status: response.status,
        body: responseBody
      })
    }

    return responseBody
  } catch (error) {
    return handleError(deps, error, 'POST')
  }
}

export const deleteRequest = async <TResponse>(
  deps: BaseDeps,
  args: DeleteArgs,
  openApiResponseValidator?: ResponseValidator<TResponse>
): Promise<void> => {
  const { httpClient } = deps
  const { accessToken } = args

  const url = checkUrlProtocol(deps, args.url)

  try {
    const response = await httpClient.delete(url, {
      headers: accessToken
        ? {
            Authorization: `GNAP ${accessToken}`
          }
        : {}
    })

    if (openApiResponseValidator) {
      openApiResponseValidator({
        status: response.status
      })
    }
  } catch (error) {
    return handleError(deps, error, 'DELETE')
  }
}

const handleError = async (
  deps: BaseDeps,
  error: unknown,
  requestType: 'POST' | 'DELETE' | 'GET'
): Promise<never> => {
  let errorDescription
  let errorStatus
  let validationErrors

  if (error instanceof HTTPError) {
    const responseBody = await error.response.json()

    errorDescription =
      responseBody && responseBody['message']
        ? responseBody['message']
        : error.message
    errorStatus = error.response?.status
  } else if (isValidationError(error)) {
    errorDescription = 'Could not validate OpenAPI response'
    validationErrors = error.errors.map((e) => e.message)
    errorStatus = error.status
  } else if (error instanceof Error) {
    errorDescription = error.message
  }

  const errorMessage = `Error making Open Payments ${requestType} request`
  deps.logger.error({ status: errorStatus, errorDescription }, errorMessage)

  throw new OpenPaymentsClientError(errorMessage, {
    description: errorDescription,
    validationErrors,
    status: errorStatus
  })
}

const checkUrlProtocol = (deps: BaseDeps, url: string): string => {
  const requestUrl = new URL(url)
  if (deps.useHttp) {
    requestUrl.protocol = 'http'
  }

  return requestUrl.href
}

type CreateHttpClientArgs = {
  requestTimeoutMs: number
} & (
  | {
      privateKey?: KeyObject
      keyId?: string
    }
  | {
      authenticatedRequestInterceptor: InterceptorFn
    }
)

export type HttpClient = KyInstance

export type InterceptorFn = (request: Request) => Request | Promise<Request>

export const createHttpClient = (args: CreateHttpClientArgs): HttpClient => {
  const kyInstance = ky.create({
    timeout: args?.requestTimeoutMs,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    }
  })

  let requestInterceptor: InterceptorFn | undefined

  if ('authenticatedRequestInterceptor' in args) {
    requestInterceptor = (request) => {
      if (requestShouldBeAuthorized(request)) {
        return args.authenticatedRequestInterceptor(request)
      }

      return request
    }
  } else if ('privateKey' in args && 'keyId' in args) {
    requestInterceptor = (request) => {
      const { privateKey, keyId } = args

      if (requestShouldBeAuthorized(request)) {
        return signRequest(request, { privateKey, keyId })
      }

      return request
    }
  }

  if (requestInterceptor) {
    return kyInstance.extend({
      hooks: {
        beforeRequest: [requestInterceptor]
      }
    })
  }

  return kyInstance
}

const requestShouldBeAuthorized = (request: Request) => {
  return (
    request.method?.toLowerCase() === 'post' ||
    request.headers.has('Authorization')
  )
}

const signRequest = async (
  request: Request,
  args: {
    privateKey?: KeyObject
    keyId?: string
  }
): Promise<Request> => {
  const { privateKey, keyId } = args

  if (!privateKey || !keyId) {
    return request
  }

  const requestBody = await request.clone().json() // Request body can only be read once, so clone the original request

  const contentAndSigHeaders = await createHeaders({
    request: {
      method: request.method.toUpperCase(),
      url: request.url,
      headers: Object.fromEntries(request.headers.entries()),
      body: requestBody ? JSON.stringify(requestBody) : undefined
    },
    privateKey,
    keyId
  })

  if (requestBody) {
    request.headers.set(
      'Content-Digest',
      contentAndSigHeaders['Content-Digest'] as string
    )
    request.headers.set(
      'Content-Length',
      contentAndSigHeaders['Content-Length'] as string
    )
    request.headers.set(
      'Content-Type',
      contentAndSigHeaders['Content-Type'] as string
    )
  }

  request.headers.set('Signature', contentAndSigHeaders['Signature'])
  request.headers.set(
    'Signature-Input',
    contentAndSigHeaders['Signature-Input']
  )

  return request
}
