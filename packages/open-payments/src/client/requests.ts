import axios, {
  AxiosInstance,
  AxiosInterceptorOptions,
  InternalAxiosRequestConfig,
  isAxiosError
} from 'axios'
import { KeyObject } from 'crypto'
import { ResponseValidator } from '@interledger/openapi'
import { BaseDeps } from '.'
//import { createHeaders } from '@interledger/http-signature-utils'
import { OpenPaymentsClientError } from './error'
import { isValidationError } from '@interledger/openapi'

interface GetArgs {
  url: string
  queryParams?: Record<string, unknown>
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

const removeEmptyValues = (obj: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(obj).filter(([_, v]) => v != null))

export const get = async <T>(
  deps: BaseDeps,
  args: GetArgs,
  openApiResponseValidator: ResponseValidator<T>
): Promise<T> => {
  const { axiosInstance } = deps
  const { accessToken } = args

  const url = checkUrlProtocol(deps, args.url)

  try {
    const { data, status } = await axiosInstance.get(url, {
      headers: accessToken
        ? {
            Authorization: `GNAP ${accessToken}`
          }
        : {},
      params: args.queryParams ? removeEmptyValues(args.queryParams) : undefined
    })

    openApiResponseValidator({
      status,
      body: data
    })

    return data
  } catch (error) {
    return handleError(deps, error, 'GET')
  }
}

export const post = async <TRequest, TResponse>(
  deps: BaseDeps,
  args: PostArgs<TRequest>,
  openApiResponseValidator: ResponseValidator<TResponse>
): Promise<TResponse> => {
  const { axiosInstance } = deps
  const { body, accessToken } = args

  const url = checkUrlProtocol(deps, args.url)

  try {
    const { data, status } = await axiosInstance.post<TResponse>(url, body, {
      headers: accessToken
        ? {
            Authorization: `GNAP ${accessToken}`
          }
        : {}
    })

    openApiResponseValidator({
      status,
      body: data
    })

    return data
  } catch (error) {
    return handleError(deps, error, 'POST')
  }
}

export const deleteRequest = async <TResponse>(
  deps: BaseDeps,
  args: DeleteArgs,
  openApiResponseValidator: ResponseValidator<TResponse>
): Promise<void> => {
  const { axiosInstance } = deps
  const { accessToken } = args

  const url = checkUrlProtocol(deps, args.url)

  try {
    const { data, status } = await axiosInstance.delete<TResponse>(url, {
      headers: accessToken
        ? {
            Authorization: `GNAP ${accessToken}`
          }
        : {}
    })

    openApiResponseValidator({
      status,
      body: data || undefined
    })
  } catch (error) {
    return handleError(deps, error, 'DELETE')
  }
}

const handleError = (
  deps: BaseDeps,
  error: unknown,
  requestType: 'POST' | 'DELETE' | 'GET'
): never => {
  let errorDescription
  let errorStatus
  let validationErrors

  if (isAxiosError(error)) {
    errorDescription = error.response?.data || error.message
    errorStatus = error.response?.status
  } else if (isValidationError(error)) {
    errorDescription = 'Could not validate OpenAPI response'
    validationErrors = error.errors
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

export interface RequestInterceptor {
    onFulfilled?:
      | ((
          value: InternalAxiosRequestConfig
        ) => InternalAxiosRequestConfig | Promise<InternalAxiosRequestConfig>)
      | null
    onRejected?: ((error: any) => any) | null
    options?: AxiosInterceptorOptions
}

export const createAxiosInstance = async (args: {
  requestTimeoutMs: number
  privateKey?: KeyObject
  keyId?: string
  requestInterceptor?: RequestInterceptor 
}): Promise<AxiosInstance> => {
  const axiosInstance = axios.create({
    headers: {
      common: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      }
    },
    timeout: args.requestTimeoutMs
  })

  if (args.requestInterceptor) {
    axiosInstance.interceptors.request.use(
      args.requestInterceptor.onFulfilled,
      args.requestInterceptor.onRejected,
      args.requestInterceptor.options
    )
  }

  if (args.privateKey !== undefined && args.keyId !== undefined) {
    const signatureUtils = await import('@interledger/http-signature-utils')
    const privateKey = args.privateKey
    const keyId = args.keyId
    axiosInstance.interceptors.request.use(
      async (config: InternalAxiosRequestConfig) => {
        if (!config.method || !config.url) {
          throw new Error('Cannot intercept request: url or method missing')
        }
        const contentAndSigHeaders = await signatureUtils.createHeaders({
          request: {
            method: config.method.toUpperCase(),
            url: config.url,
            headers: JSON.parse(JSON.stringify(config.headers)),
            body: config.data ? JSON.stringify(config.data) : undefined
          },
          privateKey,
          keyId
        })
        if (config.data) {
          config.headers['Content-Digest'] =
            contentAndSigHeaders['Content-Digest']
          config.headers['Content-Length'] =
            contentAndSigHeaders['Content-Length']
          config.headers['Content-Type'] = contentAndSigHeaders['Content-Type']
        }
        config.headers['Signature'] = contentAndSigHeaders['Signature']
        config.headers['Signature-Input'] =
          contentAndSigHeaders['Signature-Input']
        return config
      },
      undefined,
      {
        runWhen: (config: InternalAxiosRequestConfig) =>
          config.method?.toLowerCase() === 'post' ||
          !!(config.headers && config.headers['Authorization'])
      }
    )
  }

  return axiosInstance
}
