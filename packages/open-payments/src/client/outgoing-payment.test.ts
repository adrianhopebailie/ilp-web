import {
  createOutgoingPayment,
  createOutgoingPaymentRoutes,
  getOutgoingPayment,
  listOutgoingPayments,
  validateOutgoingPayment
} from './outgoing-payment'
import { OpenAPI, HttpMethod } from '@interledger/openapi'
import {
  mockOutgoingPayment,
  mockOpenApiResponseValidators,
  mockOutgoingPaymentPaginationResult,
  createTestDeps
} from '../test/helpers'
import nock from 'nock'
import { v4 as uuid } from 'uuid'
import * as requestors from './requests'
import { OpenPaymentsClientError } from './error'
import assert from 'assert'
import { getResourceServerOpenAPI } from '../openapi'

jest.mock('./requests', () => {
  return {
    // https://jestjs.io/docs/jest-object#jestmockmodulename-factory-options
    __esModule: true,
    ...jest.requireActual('./requests')
  }
})

describe('outgoing-payment', (): void => {
  let openApi: OpenAPI

  beforeAll(async () => {
    openApi = await getResourceServerOpenAPI()
  })

  const deps = createTestDeps()
  const walletAddress = `http://localhost:1000/.well-known/pay`
  const serverAddress = 'http://localhost:1000'
  const openApiValidators = mockOpenApiResponseValidators()

  describe('getOutgoingPayment', (): void => {
    test('returns outgoing payment if passes validation', async (): Promise<void> => {
      const outgoingPayment = mockOutgoingPayment()

      const scope = nock(serverAddress)
        .get('/outgoing-payments/1')
        .reply(200, outgoingPayment)

      const result = await getOutgoingPayment(
        deps,
        {
          url: `${serverAddress}/outgoing-payments/1`,
          accessToken: 'accessToken'
        },
        openApiValidators.successfulValidator
      )
      expect(result).toEqual(outgoingPayment)
      scope.done()
    })

    test('throws if outgoing payment does not pass validation', async (): Promise<void> => {
      const outgoingPayment = mockOutgoingPayment({
        debitAmount: {
          assetCode: 'USD',
          assetScale: 3,
          value: '5'
        },
        sentAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: '0'
        }
      })

      const scope = nock(serverAddress)
        .get('/outgoing-payments/1')
        .reply(200, outgoingPayment)

      try {
        await getOutgoingPayment(
          deps,
          {
            url: `${serverAddress}/outgoing-payments/1`,
            accessToken: 'accessToken'
          },
          openApiValidators.successfulValidator
        )
      } catch (error) {
        assert.ok(error instanceof OpenPaymentsClientError)
        expect(error.message).toBe('Could not validate outgoing payment')
        expect(error.description).toBe(
          'Asset code or asset scale of sending amount does not match sent amount'
        )
        expect(error.validationErrors).toEqual([
          'Asset code or asset scale of sending amount does not match sent amount'
        ])
      }

      scope.done()
    })

    test('throws if outgoing payment does not pass open api validation', async (): Promise<void> => {
      const outgoingPayment = mockOutgoingPayment()

      const scope = nock(serverAddress)
        .get('/outgoing-payments/1')
        .reply(200, outgoingPayment)

      await expect(
        getOutgoingPayment(
          deps,
          {
            url: `${serverAddress}/outgoing-payments/1`,
            accessToken: 'accessToken'
          },
          openApiValidators.failedValidator
        )
      ).rejects.toThrowError(OpenPaymentsClientError)
      scope.done()
    })
  })

  describe('listOutgoingPayment', (): void => {
    describe('forward pagination', (): void => {
      test.each`
        first        | cursor
        ${undefined} | ${undefined}
        ${1}         | ${undefined}
        ${5}         | ${uuid()}
      `(
        'returns outgoing payment list',
        async ({ first, cursor }): Promise<void> => {
          const outgoingPaymentPaginationResult =
            mockOutgoingPaymentPaginationResult({
              result: Array(first).fill(mockOutgoingPayment())
            })

          const scope = nock(serverAddress)
            .get('/outgoing-payments')
            .query({
              'wallet-address': walletAddress,
              ...(first ? { first } : {}),
              ...(cursor ? { cursor } : {})
            })
            .reply(200, outgoingPaymentPaginationResult)

          const result = await listOutgoingPayments(
            deps,
            {
              url: serverAddress,
              walletAddress,
              accessToken: 'accessToken'
            },
            openApiValidators.successfulValidator,
            {
              'wallet-address': walletAddress,
              first,
              cursor
            }
          )
          expect(result).toEqual(outgoingPaymentPaginationResult)
          scope.done()
        }
      )
    })

    describe('backward pagination', (): void => {
      test.each`
        last         | cursor
        ${undefined} | ${uuid()}
        ${5}         | ${uuid()}
      `(
        'returns outgoing payment list',
        async ({ last, cursor }): Promise<void> => {
          const outgoingPaymentPaginationResult =
            mockOutgoingPaymentPaginationResult({
              result: Array(last).fill(mockOutgoingPayment())
            })

          const scope = nock(serverAddress)
            .get('/outgoing-payments')
            .query({
              'wallet-address': walletAddress,
              ...(last ? { last } : {}),
              cursor
            })
            .reply(200, outgoingPaymentPaginationResult)

          const result = await listOutgoingPayments(
            deps,
            {
              url: serverAddress,
              walletAddress,
              accessToken: 'accessToken'
            },
            openApiValidators.successfulValidator,
            {
              'wallet-address': walletAddress,
              last,
              cursor
            }
          )
          expect(result).toEqual(outgoingPaymentPaginationResult)
          scope.done()
        }
      )
    })

    test('throws if an outgoing payment does not pass validation', async (): Promise<void> => {
      const invalidOutgoingPayment = mockOutgoingPayment({
        debitAmount: {
          assetCode: 'CAD',
          assetScale: 2,
          value: '5'
        },
        sentAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: '0'
        }
      })

      const outgoingPaymentPaginationResult =
        mockOutgoingPaymentPaginationResult({
          result: [invalidOutgoingPayment]
        })

      const scope = nock(serverAddress)
        .get('/outgoing-payments')
        .query({ 'wallet-address': walletAddress })
        .reply(200, outgoingPaymentPaginationResult)

      try {
        await listOutgoingPayments(
          deps,
          {
            url: serverAddress,
            walletAddress,
            accessToken: 'accessToken'
          },
          openApiValidators.successfulValidator
        )
      } catch (error) {
        assert.ok(error instanceof OpenPaymentsClientError)
        expect(error.message).toBe('Could not validate an outgoing payment')
        expect(error.description).toBe(
          'Asset code or asset scale of sending amount does not match sent amount'
        )
        expect(error.validationErrors).toEqual([
          'Asset code or asset scale of sending amount does not match sent amount'
        ])
      }

      scope.done()
    })

    test('throws if an outgoing payment does not pass open api validation', async (): Promise<void> => {
      const outgoingPaymentPaginationResult =
        mockOutgoingPaymentPaginationResult()

      const scope = nock(serverAddress)
        .get('/outgoing-payments')
        .query({ 'wallet-address': walletAddress })
        .reply(200, outgoingPaymentPaginationResult)

      await expect(
        listOutgoingPayments(
          deps,
          {
            url: serverAddress,
            walletAddress,
            accessToken: 'accessToken'
          },
          openApiValidators.failedValidator
        )
      ).rejects.toThrowError()
      scope.done()
    })
  })

  describe('createOutgoingPayment', (): void => {
    const quoteId = `${serverAddress}/quotes/${uuid()}`

    test.each`
      metadata
      ${{ description: 'Some description', externalRef: '#INV-1' }}
      ${undefined}
    `('creates outgoing payment', async ({ metadata }): Promise<void> => {
      const outgoingPayment = mockOutgoingPayment({
        quoteId,
        metadata
      })

      const scope = nock(serverAddress)
        .post('/outgoing-payments')
        .reply(200, outgoingPayment)

      const result = await createOutgoingPayment(
        deps,
        {
          url: serverAddress,
          accessToken: 'accessToken'
        },
        openApiValidators.successfulValidator,
        {
          quoteId,
          metadata,
          walletAddress
        }
      )
      expect(result).toEqual(outgoingPayment)
      scope.done()
    })

    test('throws if outgoing payment does not pass validation', async (): Promise<void> => {
      const outgoingPayment = mockOutgoingPayment({
        debitAmount: {
          assetCode: 'USD',
          assetScale: 3,
          value: '5'
        },
        sentAmount: {
          assetCode: 'CAD',
          assetScale: 3,
          value: '0'
        }
      })

      const scope = nock(serverAddress)
        .post('/outgoing-payments')
        .reply(200, outgoingPayment)

      try {
        await createOutgoingPayment(
          deps,
          {
            url: serverAddress,
            accessToken: 'accessToken'
          },
          openApiValidators.successfulValidator,
          {
            quoteId: uuid(),
            walletAddress
          }
        )
      } catch (error) {
        assert.ok(error instanceof OpenPaymentsClientError)
        expect(error.message).toBe('Could not create outgoing payment')
        expect(error.description).toBe(
          'Asset code or asset scale of sending amount does not match sent amount'
        )
        expect(error.validationErrors).toEqual([
          'Asset code or asset scale of sending amount does not match sent amount'
        ])
      }

      scope.done()
    })

    test('throws if outgoing payment does not pass open api validation', async (): Promise<void> => {
      const outgoingPayment = mockOutgoingPayment()

      const scope = nock(serverAddress)
        .post('/outgoing-payments')
        .reply(200, outgoingPayment)

      await expect(
        createOutgoingPayment(
          deps,
          {
            url: serverAddress,
            accessToken: 'accessToken'
          },
          openApiValidators.failedValidator,
          {
            quoteId: uuid(),
            walletAddress
          }
        )
      ).rejects.toThrowError(OpenPaymentsClientError)
      scope.done()
    })
  })

  describe('validateOutgoingPayment', (): void => {
    test('returns outgoing payment if passes validation', async (): Promise<void> => {
      const outgoingPayment = mockOutgoingPayment()

      expect(validateOutgoingPayment(outgoingPayment)).toEqual(outgoingPayment)
    })

    test('throws if send amount and sent amount asset scales are different', async (): Promise<void> => {
      const outgoingPayment = mockOutgoingPayment({
        debitAmount: {
          assetCode: 'USD',
          assetScale: 3,
          value: '5'
        },
        sentAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: '0'
        }
      })

      expect(() => validateOutgoingPayment(outgoingPayment)).toThrow(
        'Asset code or asset scale of sending amount does not match sent amount'
      )
    })

    test('throws if send amount and sent amount asset codes are different', async (): Promise<void> => {
      const outgoingPayment = mockOutgoingPayment({
        debitAmount: {
          assetCode: 'CAD',
          assetScale: 2,
          value: '5'
        },
        sentAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: '0'
        }
      })

      expect(() => validateOutgoingPayment(outgoingPayment)).toThrow(
        'Asset code or asset scale of sending amount does not match sent amount'
      )
    })

    test('throws if sent amount is larger than send amount', async (): Promise<void> => {
      const outgoingPayment = mockOutgoingPayment({
        debitAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: '5'
        },
        sentAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: '6'
        }
      })

      expect(() => validateOutgoingPayment(outgoingPayment)).toThrow(
        'Amount sent is larger than maximum amount to send'
      )
    })

    test('throws if sent amount equals send amount, but payment has failed', async (): Promise<void> => {
      const outgoingPayment = mockOutgoingPayment({
        debitAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: '5'
        },
        sentAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: '5'
        },
        failed: true
      })

      expect(() => validateOutgoingPayment(outgoingPayment)).toThrow(
        'Amount to send matches sent amount but payment failed'
      )
    })
  })

  describe('routes', (): void => {
    describe('get', (): void => {
      test('calls get method with correct validator', async (): Promise<void> => {
        const mockResponseValidator = ({ path, method }) =>
          path === '/outgoing-payments/{id}' && method === HttpMethod.GET

        const url = `${serverAddress}/outgoing-payments/1`

        jest
          .spyOn(openApi, 'createResponseValidator')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .mockImplementation(mockResponseValidator as any)

        const getSpy = jest
          .spyOn(requestors, 'get')
          .mockResolvedValueOnce(mockOutgoingPayment())

        await createOutgoingPaymentRoutes({
          openApi,
          ...deps
        }).get({ url, accessToken: 'accessToken' })

        expect(getSpy).toHaveBeenCalledWith(
          deps,
          {
            url,
            accessToken: 'accessToken'
          },
          true
        )
      })
    })

    describe('list', (): void => {
      test('calls get method with correct validator', async (): Promise<void> => {
        const mockResponseValidator = ({ path, method }) =>
          path === '/outgoing-payments' && method === HttpMethod.GET

        const outgoingPaymentPaginationResult =
          mockOutgoingPaymentPaginationResult({
            result: [mockOutgoingPayment()]
          })
        const url = `${serverAddress}/outgoing-payments`

        jest
          .spyOn(openApi, 'createResponseValidator')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .mockImplementation(mockResponseValidator as any)

        const getSpy = jest
          .spyOn(requestors, 'get')
          .mockResolvedValueOnce(outgoingPaymentPaginationResult)

        await createOutgoingPaymentRoutes({
          openApi,
          ...deps
        }).list({
          url: serverAddress,
          walletAddress,
          accessToken: 'accessToken'
        })

        expect(getSpy).toHaveBeenCalledWith(
          deps,
          {
            url,
            accessToken: 'accessToken',
            queryParams: {
              'wallet-address': walletAddress
            }
          },
          true
        )
      })
    })

    describe('create', (): void => {
      test('calls post method with correct validator', async (): Promise<void> => {
        const mockResponseValidator = ({ path, method }) =>
          path === '/outgoing-payments' && method === HttpMethod.POST

        const url = `${serverAddress}/outgoing-payments`
        const outgoingPaymentCreateArgs = {
          quoteId: uuid(),
          walletAddress
        }

        jest
          .spyOn(openApi, 'createResponseValidator')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .mockImplementation(mockResponseValidator as any)

        const postSpy = jest
          .spyOn(requestors, 'post')
          .mockResolvedValueOnce(mockOutgoingPayment(outgoingPaymentCreateArgs))

        await createOutgoingPaymentRoutes({
          openApi,
          ...deps
        }).create(
          { url: serverAddress, accessToken: 'accessToken' },
          outgoingPaymentCreateArgs
        )

        expect(postSpy).toHaveBeenCalledWith(
          deps,
          { url, accessToken: 'accessToken', body: outgoingPaymentCreateArgs },
          true
        )
      })
    })
  })
})
