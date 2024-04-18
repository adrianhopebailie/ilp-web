import {
  completeIncomingPayment,
  createIncomingPayment,
  createIncomingPaymentRoutes,
  listIncomingPayment,
  getIncomingPayment,
  validateCompletedIncomingPayment,
  validateCreatedIncomingPayment,
  validateIncomingPayment,
  createUnauthenticatedIncomingPaymentRoutes,
  getPublicIncomingPayment
} from './incoming-payment'
import { OpenAPI, HttpMethod } from '@interledger/openapi'
import {
  createTestDeps,
  mockIncomingPayment,
  mockIncomingPaymentPaginationResult,
  mockIncomingPaymentWithPaymentMethods,
  mockOpenApiResponseValidators,
  mockPublicIncomingPayment
} from '../test/helpers'
import nock from 'nock'
import { v4 as uuid } from 'uuid'
import * as requestors from './requests'
import { getRSPath } from '../types'
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

describe('incoming-payment', (): void => {
  let openApi: OpenAPI

  beforeAll(async () => {
    openApi = await getResourceServerOpenAPI()
  })

  const deps = createTestDeps()
  const walletAddress = 'http://localhost:1000/alice/.well-known/pay'
  const serverAddress = 'http://localhost:1000'
  const accessToken = 'accessToken'
  const openApiValidators = mockOpenApiResponseValidators()

  describe('getIncomingPayment', (): void => {
    test('returns incoming payment if passes validation', async (): Promise<void> => {
      const incomingPayment = mockIncomingPaymentWithPaymentMethods()

      nock(serverAddress)
        .get('/incoming-payments/1')
        .reply(200, incomingPayment)

      const result = await getIncomingPayment(
        deps,
        {
          url: `${serverAddress}/incoming-payments/1`,
          accessToken
        },
        openApiValidators.successfulValidator
      )
      expect(result).toEqual(incomingPayment)
    })

    test('throws if incoming payment does not pass validation', async (): Promise<void> => {
      const incomingPayment = mockIncomingPaymentWithPaymentMethods({
        incomingAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: '5'
        },
        receivedAmount: {
          assetCode: 'EUR',
          assetScale: 2,
          value: '5'
        }
      })

      nock(serverAddress)
        .get('/incoming-payments/1')
        .reply(200, incomingPayment)

      await expect(
        getIncomingPayment(
          deps,
          {
            url: `${serverAddress}/incoming-payments/1`,
            accessToken
          },
          openApiValidators.successfulValidator
        )
      ).rejects.toThrowError()
    })

    test('throws if incoming payment does not pass open api validation', async (): Promise<void> => {
      const incomingPayment = mockIncomingPaymentWithPaymentMethods()

      nock(serverAddress)
        .get('/incoming-payments/1')
        .query({ 'wallet-address': walletAddress })
        .reply(200, incomingPayment)

      await expect(
        getIncomingPayment(
          deps,
          {
            url: `${serverAddress}/incoming-payments/1`,
            accessToken
          },
          openApiValidators.failedValidator
        )
      ).rejects.toThrowError()
    })
  })

  describe('getPublicIncomingPayment', (): void => {
    test('returns incoming payment if passes validation', async (): Promise<void> => {
      const publicIncomingPayment = mockPublicIncomingPayment()

      nock(walletAddress)
        .get('/incoming-payments/1')
        .reply(200, publicIncomingPayment)

      const result = await getPublicIncomingPayment(
        deps,
        {
          url: `${walletAddress}/incoming-payments/1`
        },
        openApiValidators.successfulValidator
      )
      expect(result).toEqual(publicIncomingPayment)
    })

    test('throws if incoming payment does not pass open api validation', async (): Promise<void> => {
      const publicIncomingPayment = mockPublicIncomingPayment()

      nock(walletAddress)
        .get('/incoming-payments/1')
        .reply(200, publicIncomingPayment)

      await expect(
        getPublicIncomingPayment(
          deps,
          {
            url: `${walletAddress}/incoming-payments/1`
          },
          openApiValidators.failedValidator
        )
      ).rejects.toThrowError()
    })
  })

  describe('createIncomingPayment', (): void => {
    test.each`
      incomingAmount                                      | expiresAt                                      | metadata
      ${undefined}                                        | ${undefined}                                   | ${undefined}
      ${{ assetCode: 'USD', assetScale: 2, value: '10' }} | ${new Date(Date.now() + 60_000).toISOString()} | ${{ description: 'Invoice', externalRef: '#INV-1' }}
    `(
      'returns the incoming payment on success',
      async ({ incomingAmount, expiresAt, metadata }): Promise<void> => {
        const incomingPayment = mockIncomingPaymentWithPaymentMethods({
          incomingAmount,
          expiresAt,
          metadata
        })

        const scope = nock(serverAddress)
          .post('/incoming-payments')
          .reply(200, incomingPayment)

        const result = await createIncomingPayment(
          deps,
          { url: serverAddress, accessToken },
          {
            walletAddress,
            incomingAmount,
            expiresAt,
            metadata
          },
          openApiValidators.successfulValidator
        )

        scope.done()
        expect(result).toEqual(incomingPayment)
      }
    )

    test('throws if the created incoming payment does not pass validation', async (): Promise<void> => {
      const amount = {
        assetCode: 'USD',
        assetScale: 2,
        value: '10'
      }

      const incomingPayment = mockIncomingPaymentWithPaymentMethods({
        incomingAmount: amount,
        receivedAmount: amount,
        completed: false
      })

      const scope = nock(serverAddress)
        .post('/incoming-payments')
        .reply(200, incomingPayment)

      try {
        await createIncomingPayment(
          deps,
          { url: serverAddress, accessToken },
          { walletAddress },
          openApiValidators.successfulValidator
        )
      } catch (error) {
        assert.ok(error instanceof OpenPaymentsClientError)
        expect(error.message).toBe('Could not create incoming payment')
        expect(error.description).toBe('Received amount is a non-zero value')
        expect(error.validationErrors).toEqual([
          'Received amount is a non-zero value'
        ])
      }

      scope.done()
    })

    test('throws if the created incoming payment does not pass open api validation', async (): Promise<void> => {
      const incomingPayment = mockIncomingPaymentWithPaymentMethods()

      const scope = nock(serverAddress)
        .post('/incoming-payments')
        .reply(200, incomingPayment)

      await expect(
        createIncomingPayment(
          deps,
          { url: serverAddress, accessToken },
          { walletAddress },
          openApiValidators.failedValidator
        )
      ).rejects.toThrowError()
      scope.done()
    })
  })

  describe('completeIncomingPayment', (): void => {
    test('returns incoming payment if it is successfully completed', async (): Promise<void> => {
      const incomingPayment = mockIncomingPayment({
        completed: true
      })

      const scope = nock(serverAddress)
        .post(`/incoming-payments/${incomingPayment.id}/complete`)
        .reply(200, incomingPayment)

      const result = await completeIncomingPayment(
        deps,
        {
          url: `${serverAddress}/incoming-payments/${incomingPayment.id}`,
          accessToken
        },
        openApiValidators.successfulValidator
      )

      scope.done()

      expect(result).toEqual(incomingPayment)
    })

    test('throws if the incoming payment does not pass validation', async (): Promise<void> => {
      const incomingPayment = mockIncomingPayment({
        completed: false
      })

      const scope = nock(serverAddress)
        .post(`/incoming-payments/${incomingPayment.id}/complete`)
        .reply(200, incomingPayment)

      try {
        await completeIncomingPayment(
          deps,
          {
            url: `${serverAddress}/incoming-payments/${incomingPayment.id}`,
            accessToken
          },
          openApiValidators.successfulValidator
        )
      } catch (error) {
        assert.ok(error instanceof OpenPaymentsClientError)
        expect(error.message).toBe('Could not complete incoming payment')
        expect(error.description).toBe(
          'Incoming payment could not be completed'
        )
        expect(error.validationErrors).toEqual([
          'Incoming payment could not be completed'
        ])
      }

      scope.done()
    })

    test('throws if the incoming payment does not pass open api validation', async (): Promise<void> => {
      const incomingPayment = mockIncomingPayment({
        completed: true
      })

      const scope = nock(serverAddress)
        .post(`/incoming-payments/${incomingPayment.id}/complete`)
        .reply(200, incomingPayment)

      await expect(
        completeIncomingPayment(
          deps,
          {
            url: `${serverAddress}/incoming-payments/${incomingPayment.id}`,
            accessToken
          },
          openApiValidators.failedValidator
        )
      ).rejects.toThrowError(OpenPaymentsClientError)

      scope.done()
    })
  })

  describe('listIncomingPayment', (): void => {
    describe('forward pagination', (): void => {
      test.each`
        first        | cursor
        ${undefined} | ${undefined}
        ${1}         | ${undefined}
        ${5}         | ${uuid()}
      `(
        'returns incoming payments list',
        async ({ first, cursor }): Promise<void> => {
          const incomingPaymentPaginationResult =
            mockIncomingPaymentPaginationResult({
              result: Array(first).fill(mockIncomingPayment())
            })

          const scope = nock(serverAddress)
            .get('/incoming-payments')
            .query({
              'wallet-address': walletAddress,
              ...(first ? { first } : {}),
              ...(cursor ? { cursor } : {})
            })
            .reply(200, incomingPaymentPaginationResult)

          const result = await listIncomingPayment(
            deps,
            {
              url: serverAddress,
              walletAddress,
              accessToken
            },
            openApiValidators.successfulValidator,
            {
              'wallet-address': walletAddress,
              first,
              cursor
            }
          )

          expect(result).toEqual(incomingPaymentPaginationResult)
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
        'returns incoming payments list',
        async ({ last, cursor }): Promise<void> => {
          const incomingPaymentPaginationResult =
            mockIncomingPaymentPaginationResult({
              result: Array(last).fill(mockIncomingPayment())
            })

          const scope = nock(serverAddress)
            .get('/incoming-payments')
            .query({
              'wallet-address': walletAddress,
              ...(last ? { last } : {}),
              cursor
            })
            .reply(200, incomingPaymentPaginationResult)

          const result = await listIncomingPayment(
            deps,
            {
              url: serverAddress,
              walletAddress,
              accessToken
            },
            openApiValidators.successfulValidator,
            {
              'wallet-address': walletAddress,
              last,
              cursor
            }
          )

          expect(result).toEqual(incomingPaymentPaginationResult)
          scope.done()
        }
      )
    })

    test('throws if an incoming payment does not pass validation', async (): Promise<void> => {
      const incomingPayment = mockIncomingPayment({
        incomingAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: '10'
        },
        receivedAmount: {
          assetCode: 'USD',
          assetScale: 4,
          value: '0'
        }
      })

      const incomingPaymentPaginationResult =
        mockIncomingPaymentPaginationResult({
          result: [incomingPayment]
        })

      const scope = nock(serverAddress)
        .get('/incoming-payments')
        .query({ 'wallet-address': walletAddress })
        .reply(200, incomingPaymentPaginationResult)

      try {
        await listIncomingPayment(
          deps,
          {
            url: serverAddress,
            walletAddress,
            accessToken
          },
          openApiValidators.successfulValidator
        )
      } catch (error) {
        assert.ok(error instanceof OpenPaymentsClientError)
        expect(error.message).toBe('Could not validate an incoming payment')
        expect(error.description).toBe(
          'Incoming amount asset code or asset scale does not match up received amount'
        )
        expect(error.validationErrors).toEqual([
          'Incoming amount asset code or asset scale does not match up received amount'
        ])
      }

      scope.done()
    })

    test('throws if an incoming payment does not pass open api validation', async (): Promise<void> => {
      const incomingPaymentPaginationResult =
        mockIncomingPaymentPaginationResult()

      const scope = nock(serverAddress)
        .get('/incoming-payments')
        .query({ 'wallet-address': walletAddress })
        .reply(200, incomingPaymentPaginationResult)

      await expect(
        listIncomingPayment(
          deps,
          { url: serverAddress, walletAddress, accessToken },
          openApiValidators.failedValidator
        )
      ).rejects.toThrowError(OpenPaymentsClientError)

      scope.done()
    })
  })

  describe('validateIncomingPayment', (): void => {
    test('returns incoming payment if passes validation', async (): Promise<void> => {
      const incomingPayment = mockIncomingPayment({
        incomingAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: '5'
        },
        receivedAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: '5'
        },
        completed: true
      })

      expect(validateIncomingPayment(incomingPayment)).toEqual(incomingPayment)
    })

    test('throws if receiving and incoming amount asset scales are different', async (): Promise<void> => {
      const incomingPayment = mockIncomingPayment({
        incomingAmount: {
          assetCode: 'USD',
          assetScale: 1,
          value: '5'
        },
        receivedAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: '5'
        }
      })

      expect(() => validateIncomingPayment(incomingPayment)).toThrow(
        'Incoming amount asset code or asset scale does not match up received amount'
      )
    })

    test('throws if receiving and incoming asset codes are different', async (): Promise<void> => {
      const incomingPayment = mockIncomingPayment({
        incomingAmount: {
          assetCode: 'CAD',
          assetScale: 1,
          value: '5'
        },
        receivedAmount: {
          assetCode: 'USD',
          assetScale: 1,
          value: '5'
        }
      })

      expect(() => validateIncomingPayment(incomingPayment)).toThrow(
        'Incoming amount asset code or asset scale does not match up received amount'
      )
    })
  })

  describe('validateCreatedIncomingPayment', (): void => {
    test('returns the created incoming payment if it passes validation', async (): Promise<void> => {
      const incomingPayment = mockIncomingPaymentWithPaymentMethods({
        incomingAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: '5'
        },
        receivedAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: '0'
        }
      })

      expect(validateCreatedIncomingPayment(incomingPayment)).toEqual(
        incomingPayment
      )
    })

    test('throws if received amount is a non-zero value for a newly created incoming payment', async (): Promise<void> => {
      const incomingPayment = mockIncomingPaymentWithPaymentMethods({
        receivedAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: '1'
        }
      })

      expect(() => validateCreatedIncomingPayment(incomingPayment)).toThrow(
        'Received amount is a non-zero value'
      )
    })

    test('throws if the created incoming payment is completed', async (): Promise<void> => {
      const incomingPayment = mockIncomingPaymentWithPaymentMethods({
        completed: true
      })

      expect(() => validateCreatedIncomingPayment(incomingPayment)).toThrow(
        'Can not create a completed incoming payment'
      )
    })
  })

  describe('validateCompletedIncomingPayment', (): void => {
    test('returns the completed incoming payment if it passes validation', async (): Promise<void> => {
      const incomingPayment = mockIncomingPayment({
        completed: true
      })

      expect(validateCompletedIncomingPayment(incomingPayment)).toEqual(
        incomingPayment
      )
    })

    test('throws if the incoming payment is not completed', async (): Promise<void> => {
      const incomingPayment = mockIncomingPayment({
        completed: false
      })

      expect(() => validateCompletedIncomingPayment(incomingPayment)).toThrow(
        'Incoming payment could not be completed'
      )
    })
  })

  describe('routes', (): void => {
    describe('get', (): void => {
      test('calls get method with correct validator', async (): Promise<void> => {
        const mockResponseValidator = ({ path, method }) =>
          path === '/incoming-payments/{id}' && method === HttpMethod.GET

        const url = `${serverAddress}/incoming-payments/1`

        jest
          .spyOn(openApi, 'createResponseValidator')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .mockImplementation(mockResponseValidator as any)

        const getSpy = jest
          .spyOn(requestors, 'get')
          .mockResolvedValueOnce(mockIncomingPayment())

        await createIncomingPaymentRoutes({
          openApi,
          ...deps
        }).get({ url, accessToken })

        expect(getSpy).toHaveBeenCalledWith(
          deps,
          {
            url,
            accessToken
          },
          true
        )
      })
    })

    describe('getPublic', (): void => {
      test('calls getPublic method with correct validator', async (): Promise<void> => {
        const mockResponseValidator = ({ path, method }) =>
          path === '/incoming-payments/{id}' && method === HttpMethod.GET

        const url = `${serverAddress}/incoming-payments/1`

        jest
          .spyOn(openApi, 'createResponseValidator')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .mockImplementation(mockResponseValidator as any)

        const publicIncomingPayment = mockPublicIncomingPayment()

        const getSpy = jest
          .spyOn(requestors, 'get')
          .mockResolvedValueOnce(publicIncomingPayment)

        await createIncomingPaymentRoutes({
          openApi,
          ...deps
        }).getPublic({ url })

        expect(getSpy).toHaveBeenCalledWith(deps, { url }, true)
      })
    })

    describe('list', (): void => {
      test('calls get method with correct validator', async (): Promise<void> => {
        const mockResponseValidator = ({ path, method }) =>
          path === '/incoming-payments' && method === HttpMethod.GET

        const incomingPaymentPaginationResult =
          mockIncomingPaymentPaginationResult({
            result: [mockIncomingPayment()]
          })
        const url = `${serverAddress}${getRSPath('/incoming-payments')}`

        jest
          .spyOn(openApi, 'createResponseValidator')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .mockImplementation(mockResponseValidator as any)

        const getSpy = jest
          .spyOn(requestors, 'get')
          .mockResolvedValueOnce(incomingPaymentPaginationResult)

        await createIncomingPaymentRoutes({
          openApi,
          ...deps
        }).list({ url: serverAddress, walletAddress, accessToken })

        expect(getSpy).toHaveBeenCalledWith(
          deps,
          {
            url,
            accessToken,
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
          path === '/incoming-payments' && method === HttpMethod.POST

        const url = `${serverAddress}/incoming-payments`
        const incomingPaymentCreateArgs = {
          walletAddress,
          description: 'Invoice',
          incomingAmount: { assetCode: 'USD', assetScale: 2, value: '10' }
        }

        jest
          .spyOn(openApi, 'createResponseValidator')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .mockImplementation(mockResponseValidator as any)

        const postSpy = jest
          .spyOn(requestors, 'post')
          .mockResolvedValueOnce(mockIncomingPayment(incomingPaymentCreateArgs))

        await createIncomingPaymentRoutes({
          openApi,
          ...deps
        }).create(
          { url: serverAddress, accessToken },
          incomingPaymentCreateArgs
        )

        expect(postSpy).toHaveBeenCalledWith(
          deps,
          { url, accessToken, body: incomingPaymentCreateArgs },
          true
        )
      })
    })

    describe('complete', (): void => {
      test('calls post method with correct validator', async (): Promise<void> => {
        const mockResponseValidator = ({ path, method }) =>
          path === '/incoming-payments/{id}/complete' &&
          method === HttpMethod.POST

        const incomingPaymentUrl = `${serverAddress}/incoming-payments/1`

        jest
          .spyOn(openApi, 'createResponseValidator')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .mockImplementation(mockResponseValidator as any)

        const postSpy = jest
          .spyOn(requestors, 'post')
          .mockResolvedValueOnce(mockIncomingPayment({ completed: true }))

        await createIncomingPaymentRoutes({
          openApi,
          ...deps
        }).complete({ url: incomingPaymentUrl, accessToken })

        expect(postSpy).toHaveBeenCalledWith(
          deps,
          {
            url: `${incomingPaymentUrl}/complete`,
            accessToken
          },
          true
        )
      })
    })
  })

  describe('unauthenticated routes', (): void => {
    describe('get', (): void => {
      test('calls get method with correct validator', async (): Promise<void> => {
        const mockResponseValidator = ({ path, method }) =>
          path === '/incoming-payments/{id}' && method === HttpMethod.GET

        const url = `${serverAddress}/incoming-payments/1`

        jest
          .spyOn(openApi, 'createResponseValidator')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .mockImplementation(mockResponseValidator as any)

        const publicIncomingPayment = mockPublicIncomingPayment()

        const getSpy = jest
          .spyOn(requestors, 'get')
          .mockResolvedValueOnce(publicIncomingPayment)

        await createUnauthenticatedIncomingPaymentRoutes({
          openApi,
          ...deps
        }).get({ url })

        expect(getSpy).toHaveBeenCalledWith(deps, { url }, true)
      })
    })
  })
})
