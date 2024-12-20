import { createQuoteRoutes, getQuote, createQuote } from './quote'
import { OpenAPI, HttpMethod } from '@interledger/openapi'
import {
  createTestDeps,
  mockOpenApiResponseValidators,
  mockQuote
} from '../test/helpers'
import nock from 'nock'
import * as requestors from './requests'
import { getRSPath } from '../types'
import { getResourceServerOpenAPI } from '../openapi'
import { BaseDeps } from '.'

jest.mock('./requests', () => {
  return {
    // https://jestjs.io/docs/jest-object#jestmockmodulename-factory-options
    __esModule: true,
    ...jest.requireActual('./requests')
  }
})

describe('quote', (): void => {
  let openApi: OpenAPI
  let deps: BaseDeps

  beforeAll(async () => {
    openApi = await getResourceServerOpenAPI()
    deps = await createTestDeps()
  })

  const quote = mockQuote()
  const baseUrl = 'http://localhost:1000'
  const openApiValidators = mockOpenApiResponseValidators()
  const walletAddress = 'http://localhost:1000/.well-known/pay'
  const accessToken = 'accessToken'

  describe('getQuote', (): void => {
    test('returns the quote if it passes open api validation', async (): Promise<void> => {
      const scope = nock(baseUrl).get(`/quotes/${quote.id}`).reply(200, quote)
      const result = await getQuote(
        deps,
        {
          url: `${baseUrl}/quotes/${quote.id}`,
          accessToken
        },
        openApiValidators.successfulValidator
      )
      expect(result).toEqual(quote)
      expect(result.estimatedExchangeRate).toBeUndefined()
      scope.done()
    })

    test('returns the quote with the estimated exchange rate if it passes open api validation', async (): Promise<void> => {
      const quote = mockQuote({
        estimatedExchangeRate: 120
      })
      const scope = nock(baseUrl).get(`/quotes/${quote.id}`).reply(200, quote)
      const result = await getQuote(
        deps,
        {
          url: `${baseUrl}/quotes/${quote.id}`,
          accessToken
        },
        openApiValidators.successfulValidator
      )
      expect(result).toEqual(quote)
      scope.done()
    })

    test('throws if quote does not pass open api validation', async (): Promise<void> => {
      const scope = nock(baseUrl).get(`/quotes/${quote.id}`).reply(200, quote)

      await expect(() =>
        getQuote(
          deps,
          {
            url: `${baseUrl}/quotes/${quote.id}`,
            accessToken
          },
          openApiValidators.failedValidator
        )
      ).rejects.toThrowError()
      scope.done()
    })
  })

  describe('createQuote', (): void => {
    test('returns the quote if it passes open api validation', async (): Promise<void> => {
      const scope = nock(baseUrl).post(`/quotes`).reply(200, quote)
      const result = await createQuote(
        deps,
        {
          url: baseUrl,
          accessToken
        },
        openApiValidators.successfulValidator,
        { receiver: quote.receiver, method: 'ilp', walletAddress }
      )
      expect(result).toEqual(quote)
      expect(result.estimatedExchangeRate).toBeUndefined()
      scope.done()
    })

    test('throws if quote does not pass open api validation', async (): Promise<void> => {
      const scope = nock(baseUrl).post(`/quotes`).reply(200, quote)
      await expect(() =>
        createQuote(
          deps,
          {
            url: baseUrl,
            accessToken
          },
          openApiValidators.failedValidator,
          { receiver: quote.receiver, method: 'ilp', walletAddress }
        )
      ).rejects.toThrowError()
      scope.done()
    })

    test('returns estimated exchange rate if amount can not be sent over the path', async (): Promise<void> => {
      const quote = mockQuote({
        receiveAmount: { value: '0', assetCode: 'ZAR', assetScale: 2 },
        estimatedExchangeRate: 120
      })
      const scope = nock(baseUrl).post(`/quotes`).reply(200, quote)
      const result = await createQuote(
        deps,
        {
          url: baseUrl,
          accessToken
        },
        openApiValidators.successfulValidator,
        { receiver: quote.receiver, method: 'ilp', walletAddress }
      )
      expect(result).toEqual(quote)
      scope.done()
    })
  })

  describe('routes', (): void => {
    describe('get', (): void => {
      test.each`
        validateResponses | description
        ${true}           | ${'with response validation'}
        ${false}          | ${'without response validation'}
      `(
        'calls get method $description',
        async ({ validateResponses }): Promise<void> => {
          const mockResponseValidator = ({ path, method }) =>
            path === `/quotes/{id}` && method === HttpMethod.GET

          jest
            .spyOn(openApi, 'createResponseValidator')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .mockImplementation(mockResponseValidator as any)

          const getSpy = jest
            .spyOn(requestors, 'get')
            .mockResolvedValueOnce(quote)
          const url = `${baseUrl}${getRSPath('/quotes/{id}')}`

          await createQuoteRoutes({
            openApi: validateResponses ? openApi : undefined,
            ...deps
          }).get({
            url,
            accessToken
          })

          expect(getSpy).toHaveBeenCalledWith(
            deps,
            { url, accessToken },
            validateResponses ? true : undefined
          )
        }
      )
    })

    describe('create', (): void => {
      test.each`
        validateResponses | description
        ${true}           | ${'with response validation'}
        ${false}          | ${'without response validation'}
      `(
        'calls post method $description',
        async ({ validateResponses }): Promise<void> => {
          const mockResponseValidator = ({ path, method }) =>
            path === `/quotes` && method === HttpMethod.POST

          jest
            .spyOn(openApi, 'createResponseValidator')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .mockImplementation(mockResponseValidator as any)

          const postSpy = jest
            .spyOn(requestors, 'post')
            .mockResolvedValueOnce(quote)
          const url = `${baseUrl}${getRSPath('/quotes')}`

          await createQuoteRoutes({
            openApi: validateResponses ? openApi : undefined,
            ...deps
          }).create(
            {
              url: baseUrl,
              accessToken
            },
            { receiver: quote.receiver, method: 'ilp', walletAddress }
          )

          expect(postSpy).toHaveBeenCalledWith(
            deps,
            {
              url,
              accessToken,
              body: { receiver: quote.receiver, method: 'ilp', walletAddress }
            },
            validateResponses ? true : undefined
          )
        }
      )
    })
  })
})
