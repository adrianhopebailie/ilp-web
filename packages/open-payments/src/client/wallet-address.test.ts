import { createWalletAddressRoutes } from './wallet-address'
import { OpenAPI, HttpMethod, createOpenAPI } from '@interledger/openapi'
import path from 'path'
import {
  defaultAxiosInstance,
  mockJwk,
  mockWalletAddress,
  silentLogger
} from '../test/helpers'
import * as requestors from './requests'

jest.mock('./requests', () => {
  return {
    // https://jestjs.io/docs/jest-object#jestmockmodulename-factory-options
    __esModule: true,
    ...jest.requireActual('./requests')
  }
})

describe('wallet-address', (): void => {
  let openApi: OpenAPI

  beforeAll(async () => {
    openApi = await createOpenAPI(
      path.resolve(__dirname, '../openapi/resource-server.yaml')
    )
  })

  const axiosInstance = defaultAxiosInstance
  const logger = silentLogger

  describe('routes', (): void => {
    const walletAddress = mockWalletAddress()

    describe('get', (): void => {
      test('calls get method with correct validator', async (): Promise<void> => {
        const mockResponseValidator = ({ path, method }) =>
          path === '/' && method === HttpMethod.GET

        jest
          .spyOn(openApi, 'createResponseValidator')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .mockImplementation(mockResponseValidator as any)

        const getSpy = jest
          .spyOn(requestors, 'get')
          .mockResolvedValueOnce(walletAddress)

        await createWalletAddressRoutes({
          openApi,
          axiosInstance,
          logger
        }).get({ url: walletAddress.id })

        expect(getSpy).toHaveBeenCalledWith(
          { axiosInstance, logger },
          { url: walletAddress.id },
          true
        )
      })
    })

    describe('getKeys', (): void => {
      test('calls get method with correct validator', async (): Promise<void> => {
        const mockResponseValidator = ({ path, method }) =>
          path === '/jwks.json' && method === HttpMethod.GET

        jest
          .spyOn(openApi, 'createResponseValidator')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .mockImplementation(mockResponseValidator as any)

        const getSpy = jest
          .spyOn(requestors, 'get')
          .mockResolvedValueOnce([mockJwk()])

        await createWalletAddressRoutes({
          openApi,
          axiosInstance,
          logger
        }).getKeys({ url: walletAddress.id })

        expect(getSpy).toHaveBeenCalledWith(
          {
            axiosInstance,
            logger
          },
          { url: `${walletAddress.id}/jwks.json` },
          true
        )
      })
    })
  })
})
