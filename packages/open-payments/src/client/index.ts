import { loadKey } from '@interledger/http-signature-utils'
import fs from 'fs'
import { createOpenAPI, OpenAPI } from '@interledger/openapi'
import path from 'path'
import createLogger, { LevelWithSilent, Logger } from 'pino'
import config from '../config'
import {
  createIncomingPaymentRoutes,
  createUnauthenticatedIncomingPaymentRoutes,
  IncomingPaymentRoutes,
  UnauthenticatedIncomingPaymentRoutes
} from './incoming-payment'
import {
  createWalletAddressRoutes,
  WalletAddressRoutes
} from './wallet-address'
import { createAxiosInstance, RequestInterceptor } from './requests'
import { AxiosInstance, AxiosInterceptorManager, InternalAxiosRequestConfig } from 'axios'
import { createGrantRoutes, GrantRoutes } from './grant'
import {
  createOutgoingPaymentRoutes,
  OutgoingPaymentRoutes
} from './outgoing-payment'
import { createTokenRoutes, TokenRoutes } from './token'
import { createQuoteRoutes, QuoteRoutes } from './quote'
import { KeyLike, KeyObject, createPrivateKey } from 'crypto'
import { OpenPaymentsClientError } from './error'
export * from './error'

export interface BaseDeps {
  axiosInstance: AxiosInstance
  logger: Logger
  useHttp: boolean
}

interface UnauthenticatedClientDeps extends BaseDeps {
  walletAddressServerOpenApi: OpenAPI
  resourceServerOpenApi: OpenAPI
}

interface AuthenticatedClientDeps extends UnauthenticatedClientDeps {
  authServerOpenApi: OpenAPI
}

export interface RouteDeps extends BaseDeps {
  axiosInstance: AxiosInstance
  openApi: OpenAPI
  logger: Logger
}

export interface UnauthenticatedResourceRequestArgs {
  /**
   * The full URL of the requested resource.
   *
   * For example, if the requested resource is an incoming payment:
   * ```
   * https://openpayments.guide/incoming-payments/08394f02-7b7b-45e2-b645-51d04e7c330c`
   * ```
   */
  url: string
}

interface AuthenticatedRequestArgs {
  /**
   * The access token required to access the resource.
   * This token is provided when a grant is created.
   *
   * @see [Open Payments - Grant Request](https://openpayments.guide/apis/auth-server/operations/post-request/)
   */
  accessToken: string
}

export interface GrantOrTokenRequestArgs
  extends UnauthenticatedResourceRequestArgs,
    AuthenticatedRequestArgs {}

export interface ResourceRequestArgs
  extends UnauthenticatedResourceRequestArgs,
    AuthenticatedRequestArgs {}

export interface CollectionRequestArgs
  extends UnauthenticatedResourceRequestArgs,
    AuthenticatedRequestArgs {
  /**
   * The wallet address URL of the requested collection.
   *
   * Example:
   * ```
   * https://openpayments.guide/alice`
   * ```
   */
  walletAddress: string
}

const parseKey = (
  args: Partial<CreateAuthenticatedClientArgs>
): KeyObject | undefined => {
  if (!args.privateKey) {
    return undefined
  }

  if (args.privateKey instanceof KeyObject) {
    return args.privateKey
  }

  if (args.privateKey instanceof Buffer) {
    try {
      return createPrivateKey(args.privateKey)
    } catch {
      throw new Error('Key is not a valid file')
    }
  }

  if (fs.existsSync(path.resolve(process.cwd(), args.privateKey))) {
    return loadKey(path.resolve(process.cwd(), args.privateKey))
  }

  try {
    return createPrivateKey(args.privateKey)
  } catch {
    throw new Error('Key is not a valid path or file')
  }
}

const createUnauthenticatedDeps = async ({
  useHttp = false,
  ...args
}: Partial<CreateUnauthenticatedClientArgs> = {}): Promise<UnauthenticatedClientDeps> => {
  const logger = args?.logger ?? createLogger({ name: 'Open Payments Client' })
  if (args.logLevel) {
    logger.level = args.logLevel
  }

  const axiosInstance = await createAxiosInstance({
    requestTimeoutMs:
      args?.requestTimeoutMs ?? config.DEFAULT_REQUEST_TIMEOUT_MS
  })

  const walletAddressServerOpenApi = await createOpenAPI(
    path.resolve(__dirname, '../openapi/wallet-address-server.yaml')
  )
  const resourceServerOpenApi = await createOpenAPI(
    path.resolve(__dirname, '../openapi/resource-server.yaml')
  )

  return {
    axiosInstance,
    walletAddressServerOpenApi,
    resourceServerOpenApi,
    logger,
    useHttp
  }
}

const createAuthenticatedClientDeps = async ({
  useHttp = false,
  ...args
}: Partial<CreateAuthenticatedClientArgs> = {}): Promise<AuthenticatedClientDeps> => {
  const logger = args?.logger ?? createLogger({ name: 'Open Payments Client' })
  if (args.logLevel) {
    logger.level = args.logLevel
  }

  let axiosInstance: AxiosInstance

  if(args.requestInterceptor) {
      axiosInstance = await createAxiosInstance({
          requestInterceptor: args.requestInterceptor,
          requestTimeoutMs: args?.requestTimeoutMs ?? config.DEFAULT_REQUEST_TIMEOUT_MS
      })
  } else {
      let privateKey: KeyObject | undefined
      try {
          privateKey = parseKey(args)
      } catch (error) {
          const errorMessage =
              'Could not load private key when creating Open Payments client'
          const description = error instanceof Error ? error.message : 'Unknown error'

          logger.error({ description }, errorMessage)

          throw new OpenPaymentsClientError(errorMessage, {
              description
          })
      }
      axiosInstance = await createAxiosInstance({
          privateKey,
          keyId: args.keyId,
          requestTimeoutMs:
              args?.requestTimeoutMs ?? config.DEFAULT_REQUEST_TIMEOUT_MS
      })
  }


  const walletAddressServerOpenApi = await createOpenAPI(
    path.resolve(__dirname, '../openapi/wallet-address-server.yaml')
  )
  const resourceServerOpenApi = await createOpenAPI(
    path.resolve(__dirname, '../openapi/resource-server.yaml')
  )
  const authServerOpenApi = await createOpenAPI(
    path.resolve(__dirname, '../openapi/auth-server.yaml')
  )

  return {
    axiosInstance,
    walletAddressServerOpenApi,
    resourceServerOpenApi,
    authServerOpenApi,
    logger,
    useHttp
  }
}

export interface CreateUnauthenticatedClientArgs {
  /** Milliseconds to wait before timing out an HTTP request */
  requestTimeoutMs?: number
  /** The custom logger instance to use. This defaults to the pino logger. */
  logger?: Logger
  /** The desired logging level  */
  logLevel?: LevelWithSilent
  /** If enabled, all requests will use http as protocol. Use in development mode only. */
  useHttp?: boolean
}

export interface UnauthenticatedClient {
  walletAddress: WalletAddressRoutes
  incomingPayment: UnauthenticatedIncomingPaymentRoutes
}

/**
 * Creates an OpenPayments client that is only able to make requests for public fields.
 */
export const createUnauthenticatedClient = async (
  args: CreateUnauthenticatedClientArgs
): Promise<UnauthenticatedClient> => {
  const { resourceServerOpenApi, walletAddressServerOpenApi, ...baseDeps } =
    await createUnauthenticatedDeps(args)

  return {
    walletAddress: createWalletAddressRoutes({
      ...baseDeps,
      openApi: walletAddressServerOpenApi
    }),
    incomingPayment: createUnauthenticatedIncomingPaymentRoutes({
      ...baseDeps,
      openApi: resourceServerOpenApi
    })
  }
}

export interface CreateAuthenticatedClientArgs
  extends CreateUnauthenticatedClientArgs {
  /** The private EdDSA-Ed25519 key (or the relative or absolute path to the key) with which requests will be signed */
  privateKey?: string | KeyLike
  /** The key identifier referring to the private key */
  keyId?: string
  /** The wallet address which the client will identify itself by */
  walletAddressUrl: string
  requestInterceptor: RequestInterceptor
}

export interface AuthenticatedClient
  extends Omit<UnauthenticatedClient, 'incomingPayment'> {
  incomingPayment: IncomingPaymentRoutes
  outgoingPayment: OutgoingPaymentRoutes
  grant: GrantRoutes
  token: TokenRoutes
  quote: QuoteRoutes
}

export const createAuthenticatedClient = async (
  args: CreateAuthenticatedClientArgs
): Promise<AuthenticatedClient> => {
  const {
    resourceServerOpenApi,
    authServerOpenApi,
    walletAddressServerOpenApi,
    ...baseDeps
  } = await createAuthenticatedClientDeps(args)

  return {
    incomingPayment: createIncomingPaymentRoutes({
      ...baseDeps,
      openApi: resourceServerOpenApi
    }),
    outgoingPayment: createOutgoingPaymentRoutes({
      ...baseDeps,
      openApi: resourceServerOpenApi
    }),
    walletAddress: createWalletAddressRoutes({
      ...baseDeps,
      openApi: walletAddressServerOpenApi
    }),
    grant: createGrantRoutes({
      ...baseDeps,
      openApi: authServerOpenApi,
      client: args.walletAddressUrl
    }),
    token: createTokenRoutes({
      ...baseDeps,
      openApi: authServerOpenApi
    }),
    quote: createQuoteRoutes({
      ...baseDeps,
      openApi: resourceServerOpenApi
    })
  }
}
