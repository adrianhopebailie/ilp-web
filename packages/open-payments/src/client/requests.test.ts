/* eslint-disable @typescript-eslint/no-empty-function */
import { createHttpClient, deleteRequest, get, post } from './requests'
import { generateKeyPairSync } from 'crypto'
import nock from 'nock'
import { createTestDeps, mockOpenApiResponseValidators } from '../test/helpers'
import { OpenPaymentsClientError } from './error'
import assert from 'assert'

describe('requests', (): void => {
  const privateKey = generateKeyPairSync('ed25519').privateKey
  const keyId = 'myId'
  const httpClient = createHttpClient({
    requestTimeoutMs: 1000000,
    privateKey,
    keyId
  })
  const deps = createTestDeps({
    httpClient
  })

  describe('createHttpClient', (): void => {
    test('sets timeout properly', async (): Promise<void> => {
      expect(
        createHttpClient({ requestTimeoutMs: 1000, privateKey, keyId })
      ).toBe(1000)
    })
    test('sets Accept header properly', async (): Promise<void> => {
      expect(
        createHttpClient({ requestTimeoutMs: 0, privateKey, keyId })['hooks']
          .headers.common['Accept']
      ).toBe('application/json')
    })
    test('sets Content-Type header properly', async (): Promise<void> => {
      expect(
        createHttpClient({ requestTimeoutMs: 0, privateKey, keyId }).defaults
          .headers.common['Content-Type']
      ).toBe('application/json')
    })

    test('sets private key request interceptor', async (): Promise<void> => {
      const httpClient = createHttpClient({
        requestTimeoutMs: 0,
        authenticatedRequestInterceptor: (config) => config
      })
      expect(httpClient.interceptors.request['handlers'][0]).toBeDefined()
      expect(
        httpClient.interceptors.request['handlers'][0].fulfilled
      ).toBeDefined()
      expect(httpClient.interceptors.request['handlers'][0].fulfilled).toEqual(
        expect.any(Function)
      )
    })

    test('sets authenticated request interceptor', async (): Promise<void> => {
      const httpClient = createHttpClient({
        requestTimeoutMs: 0,
        authenticatedRequestInterceptor: (config) => config
      })
      expect(httpClient.interceptors.request['handlers'][0]).toBeDefined()
      expect(
        httpClient.interceptors.request['handlers'][0].fulfilled
      ).toBeDefined()
      expect(httpClient.interceptors.request['handlers'][0].fulfilled).toEqual(
        expect.any(Function)
      )
    })
  })

  describe('get', (): void => {
    const baseUrl = 'http://localhost:1000'
    const responseValidators = mockOpenApiResponseValidators()

    beforeAll(() => {
      jest.spyOn(httpClient, 'get')
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    test('sets headers properly if accessToken provided', async (): Promise<void> => {
      // https://github.com/nock/nock/issues/2200#issuecomment-1280957462
      jest
        .useFakeTimers({
          doNotFake: [
            'nextTick',
            'setImmediate',
            'clearImmediate',
            'setInterval',
            'clearInterval',
            'setTimeout',
            'clearTimeout'
          ]
        })
        .setSystemTime(new Date())

      const scope = nock(baseUrl)
        .matchHeader('Signature', /sig1=:([a-zA-Z0-9+/]){86}==:/)
        .matchHeader(
          'Signature-Input',
          `sig1=("@method" "@target-uri" "authorization");keyid="${keyId}";created=${Math.floor(
            Date.now() / 1000
          )}`
        )
        .get('/incoming-payments')
        // TODO: verify signature
        .reply(200)

      await get(
        deps,
        {
          url: `${baseUrl}/incoming-payments`,
          accessToken: 'accessToken'
        },
        responseValidators.successfulValidator
      )

      scope.done()

      expect(httpClient.get).toHaveBeenCalledWith(
        `${baseUrl}/incoming-payments`,
        {
          headers: {
            Authorization: 'GNAP accessToken'
          }
        }
      )
    })

    test('sets headers properly if accessToken is not provided', async (): Promise<void> => {
      const scope = nock(baseUrl)
        .matchHeader('Signature', (sig) => sig === undefined)
        .matchHeader('Signature-Input', (sigInput) => sigInput === undefined)
        .get('/incoming-payments')
        .reply(200)

      await get(
        deps,
        {
          url: `${baseUrl}/incoming-payments`
        },
        responseValidators.successfulValidator
      )
      scope.done()

      expect(httpClient.get).toHaveBeenCalledWith(
        `${baseUrl}/incoming-payments`,
        {
          headers: {}
        }
      )
    })

    test.each`
      title                      | queryParams
      ${'all defined values'}    | ${{ first: 5, cursor: 'id' }}
      ${'some undefined values'} | ${{ first: 5, cursor: undefined }}
      ${'all undefined values'}  | ${{ first: undefined, cursor: undefined }}
    `(
      'properly sets query params with $title',
      async ({ queryParams }): Promise<void> => {
        const cleanedQueryParams = Object.fromEntries(
          Object.entries(queryParams).filter(([_, v]) => v != null)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ) as any

        const scope = nock(baseUrl)
          .matchHeader('Signature', (sig) => sig === undefined)
          .matchHeader('Signature-Input', (sigInput) => sigInput === undefined)
          .get('/incoming-payments')
          .query(cleanedQueryParams)
          .reply(200)

        await get(
          deps,
          {
            url: `${baseUrl}/incoming-payments`,
            queryParams
          },
          responseValidators.successfulValidator
        )
        scope.done()

        expect(httpClient.get).toHaveBeenCalledWith(
          `${baseUrl}/incoming-payments`,
          {
            headers: {},
            params: cleanedQueryParams
          }
        )
      }
    )

    test('calls validator function properly', async (): Promise<void> => {
      const status = 200
      const body = {
        id: 'id'
      }

      nock(baseUrl).get('/incoming-payments').reply(status, body)

      const responseValidatorSpy = jest.spyOn(
        responseValidators,
        'successfulValidator'
      )

      await get(
        deps,
        {
          url: `${baseUrl}/incoming-payments`
        },
        responseValidators.successfulValidator
      )

      expect(responseValidatorSpy).toHaveBeenCalledWith({
        body,
        status
      })
    })

    test('throws if failed request', async (): Promise<void> => {
      nock(baseUrl).get('/incoming-payments').reply(400, 'Bad Request')

      try {
        await get(
          deps,
          {
            url: `${baseUrl}/incoming-payments`
          },
          responseValidators.successfulValidator
        )
      } catch (error) {
        assert.ok(error instanceof OpenPaymentsClientError)
        expect(error.message).toBe('Error making Open Payments GET request')
        expect(error.description).toBe('Bad Request')
        expect(error.status).toBe(400)
        expect(error.validationErrors).toBeUndefined()
      }
    })

    test('throws if response validator function fails', async (): Promise<void> => {
      nock(baseUrl).get('/incoming-payments').reply(200)

      try {
        await get(
          deps,
          {
            url: `${baseUrl}/incoming-payments`
          },
          responseValidators.failedValidator
        )
      } catch (error) {
        assert.ok(error instanceof OpenPaymentsClientError)
        expect(error.message).toBe('Error making Open Payments GET request')
        expect(error.description).toBe('Could not validate OpenAPI response')
        expect(error.status).toBeUndefined()
        expect(error.validationErrors).toEqual(['Failed to validate response'])
      }
    })

    test('keeps https protocol for request if non-development environment', async (): Promise<void> => {
      const httpsUrl = 'https://localhost:1000/'
      const scope = nock(httpsUrl).get('/').reply(200)

      await get(deps, { url: httpsUrl }, responseValidators.successfulValidator)

      expect(httpClient.get).toHaveBeenCalledWith(httpsUrl, {
        headers: {}
      })
      scope.done()
    })

    test('uses http protocol for request if development environment', async (): Promise<void> => {
      const tmpDeps = createTestDeps({
        httpClient: httpClient,
        useHttp: true
      })
      const httpsUrl = 'https://localhost:1000/'
      const httpUrl = httpsUrl.replace('https', 'http')
      const scope = nock(httpUrl).get('/').reply(200)

      await get(
        tmpDeps,
        { url: httpsUrl },
        responseValidators.successfulValidator
      )

      expect(httpClient.get).toHaveBeenCalledWith(httpUrl, {
        headers: {}
      })
      scope.done()
    })
  })

  describe('post', (): void => {
    const baseUrl = 'http://localhost:1000'
    const responseValidators = mockOpenApiResponseValidators()

    beforeAll(() => {
      jest.spyOn(httpClient, 'post')
    })

    test('properly POSTs request', async (): Promise<void> => {
      const status = 200
      const body = {
        id: 'id'
      }

      // https://github.com/nock/nock/issues/2200#issuecomment-1280957462
      jest
        .useFakeTimers({
          doNotFake: [
            'nextTick',
            'setImmediate',
            'clearImmediate',
            'setInterval',
            'clearInterval',
            'setTimeout',
            'clearTimeout'
          ]
        })
        .setSystemTime(new Date())

      const scope = nock(baseUrl)
        .matchHeader('Signature', /sig1=:([a-zA-Z0-9+/]){86}==:/)
        .matchHeader(
          'Signature-Input',
          `sig1=("@method" "@target-uri" "content-digest" "content-length" "content-type");keyid="${keyId}";created=${Math.floor(
            Date.now() / 1000
          )}`
        )
        .matchHeader('Accept', 'application/json')
        .matchHeader('Content-Digest', /sha-512=:([a-zA-Z0-9+/]){86}==:/)
        .matchHeader('Content-Length', '11')
        .matchHeader('Content-Type', 'application/json')
        .post('/grant', body)
        // TODO: verify signature
        .reply(status, body)

      await post(
        deps,
        {
          url: `${baseUrl}/grant`,
          body
        },
        responseValidators.successfulValidator
      )
      scope.done()

      expect(httpClient.post).toHaveBeenCalledWith(`${baseUrl}/grant`, {
        headers: {},
        json: body
      })
    })

    test('properly POSTs request with accessToken', async (): Promise<void> => {
      const status = 200
      const body = {
        id: 'id'
      }
      const accessToken = 'someAccessToken'

      // https://github.com/nock/nock/issues/2200#issuecomment-1280957462
      jest
        .useFakeTimers({
          doNotFake: [
            'nextTick',
            'setImmediate',
            'clearImmediate',
            'setInterval',
            'clearInterval',
            'setTimeout',
            'clearTimeout'
          ]
        })
        .setSystemTime(new Date())

      const scope = nock(baseUrl)
        .matchHeader('Signature', /sig1=:([a-zA-Z0-9+/]){86}==:/)
        .matchHeader(
          'Signature-Input',
          `sig1=("@method" "@target-uri" "authorization" "content-digest" "content-length" "content-type");keyid="${keyId}";created=${Math.floor(
            Date.now() / 1000
          )}`
        )
        .matchHeader('Accept', 'application/json')
        .matchHeader('Authorization', `GNAP ${accessToken}`)
        .matchHeader('Content-Digest', /sha-512=:([a-zA-Z0-9+/]){86}==:/)
        .matchHeader('Content-Length', '11')
        .matchHeader('Content-Type', 'application/json')
        .post('/grant', body)
        // TODO: verify signature
        .reply(status, body)

      await post(
        deps,
        {
          url: `${baseUrl}/grant`,
          body,
          accessToken
        },
        responseValidators.successfulValidator
      )
      scope.done()

      expect(httpClient.post).toHaveBeenCalledWith(`${baseUrl}/grant`, {
        headers: { Authorization: `GNAP ${accessToken}` },
        json: body
      })
    })

    test('calls validator function properly', async (): Promise<void> => {
      const status = 200
      const body = {
        id: 'id'
      }

      nock(baseUrl).post('/grant', body).reply(status, body)

      const responseValidatorSpy = jest.spyOn(
        responseValidators,
        'successfulValidator'
      )

      await post(
        deps,
        {
          url: `${baseUrl}/grant`,
          body
        },
        responseValidators.successfulValidator
      )

      expect(responseValidatorSpy).toHaveBeenCalledWith({
        body,
        status
      })
    })

    test('throws if failed request', async (): Promise<void> => {
      const body = {
        id: 'id'
      }
      nock(baseUrl).post('/grant', body).reply(400, 'Bad Request')

      expect.assertions(4)

      try {
        await post(
          deps,
          {
            url: `${baseUrl}/grant`,
            body
          },
          responseValidators.successfulValidator
        )
      } catch (error) {
        assert.ok(error instanceof OpenPaymentsClientError)
        expect(error.message).toBe('Error making Open Payments POST request')
        expect(error.description).toBe('Bad Request')
        expect(error.status).toBe(400)
        expect(error.validationErrors).toBeUndefined()
      }
    })

    test('throws if response validator function fails', async (): Promise<void> => {
      const status = 200
      const body = {
        id: 'id'
      }
      nock(baseUrl).post('/grant', body).reply(status, body)

      expect.assertions(4)

      try {
        await post(
          deps,
          {
            url: `${baseUrl}/grant`,
            body
          },
          responseValidators.failedValidator
        )
      } catch (error) {
        assert.ok(error instanceof OpenPaymentsClientError)
        expect(error.message).toBe('Error making Open Payments POST request')
        expect(error.description).toBe('Could not validate OpenAPI response')
        expect(error.status).toBeUndefined()
        expect(error.validationErrors).toEqual(['Failed to validate response'])
      }
    })

    test('keeps https protocol for request if non-development environment', async (): Promise<void> => {
      const httpsUrl = 'https://localhost:1000/'
      const scope = nock(httpsUrl).post('/').reply(200)

      await post(
        deps,
        { url: httpsUrl },
        responseValidators.successfulValidator
      )

      expect(httpClient.post).toHaveBeenCalledWith(httpsUrl, undefined, {
        headers: {}
      })
      scope.done()
    })

    test('uses http protocol for request if development environment', async (): Promise<void> => {
      const tmpDeps = createTestDeps({
        httpClient,
        useHttp: true
      })
      const httpsUrl = 'https://localhost:1000/'
      const httpUrl = httpsUrl.replace('https', 'http')
      const scope = nock(httpUrl).post('/').reply(200)

      await post(
        tmpDeps,
        { url: httpsUrl },
        responseValidators.successfulValidator
      )

      expect(httpClient.post).toHaveBeenCalledWith(httpUrl, {
        json: undefined,
        headers: {}
      })
      scope.done()
    })
  })

  describe('delete', (): void => {
    const baseUrl = 'http://localhost:1000'
    const responseValidators = mockOpenApiResponseValidators()

    beforeAll(() => {
      jest.spyOn(httpClient, 'delete')
    })

    test('properly makes DELETE request', async (): Promise<void> => {
      const status = 202

      const scope = nock(baseUrl)
        .delete(`/grant`)
        // TODO: verify signature
        .reply(status)

      await deleteRequest(
        deps,
        {
          url: `${baseUrl}/grant`
        },
        responseValidators.successfulValidator
      )
      scope.done()

      expect(httpClient.delete).toHaveBeenCalledWith(`${baseUrl}/grant`, {
        headers: {}
      })
    })

    test('properly makes DELETE request with accessToken', async (): Promise<void> => {
      const status = 202
      const accessToken = 'someAccessToken'

      const scope = nock(baseUrl)
        .matchHeader('Signature', /sig1=:([a-zA-Z0-9+/]){86}==:/)
        .matchHeader(
          'Signature-Input',
          `sig1=("@method" "@target-uri" "authorization");keyid="${keyId}";created=${Math.floor(
            Date.now() / 1000
          )}`
        )
        .matchHeader('Authorization', `GNAP ${accessToken}`)
        .delete(`/grant/`)
        // TODO: verify signature
        .reply(status)

      await deleteRequest(
        deps,
        {
          url: `${baseUrl}/grant/`,
          accessToken
        },
        responseValidators.successfulValidator
      )
      scope.done()

      expect(httpClient.delete).toHaveBeenCalledWith(`${baseUrl}/grant/`, {
        headers: {
          Authorization: `GNAP ${accessToken}`
        }
      })
    })

    test.each`
      title                              | response
      ${'when response is defined'}      | ${{ some: 'value' }}
      ${'when response is undefined'}    | ${undefined}
      ${'when response is null'}         | ${null}
      ${'when response is empty string'} | ${''}
    `(
      'calls validator function properly $title',
      async ({ response }): Promise<void> => {
        const status = 202

        const scope = nock(baseUrl)
          .delete(`/grant`)
          // TODO: verify signature
          .reply(status, response)

        const responseValidatorSpy = jest.spyOn(
          responseValidators,
          'successfulValidator'
        )

        await deleteRequest(
          deps,
          {
            url: `${baseUrl}/grant`
          },
          responseValidators.successfulValidator
        )

        scope.done()
        expect(responseValidatorSpy).toHaveBeenCalledWith({
          body: response || undefined,
          status
        })
      }
    )

    test('throws if failed request', async (): Promise<void> => {
      nock(baseUrl).delete('/grant').reply(400, 'Bad Request')

      try {
        await deleteRequest(
          deps,
          {
            url: `${baseUrl}/grant`
          },
          responseValidators.successfulValidator
        )
      } catch (error) {
        assert.ok(error instanceof OpenPaymentsClientError)
        expect(error.message).toBe('Error making Open Payments DELETE request')
        expect(error.description).toBe('Bad Request')
        expect(error.status).toBe(400)
        expect(error.validationErrors).toBeUndefined()
      }
    })

    test('throws if response validator function fails', async (): Promise<void> => {
      const status = 299
      nock(baseUrl).delete('/grant').reply(status)

      try {
        await deleteRequest(
          deps,
          {
            url: `${baseUrl}/grant`
          },
          responseValidators.failedValidator
        )
      } catch (error) {
        assert.ok(error instanceof OpenPaymentsClientError)
        expect(error.message).toBe('Error making Open Payments DELETE request')
        expect(error.description).toBe('Could not validate OpenAPI response')
        expect(error.status).toBeUndefined()
        expect(error.validationErrors).toEqual(['Failed to validate response'])
      }
    })

    test('keeps https protocol for request if non-development environment', async (): Promise<void> => {
      const httpsUrl = 'https://localhost:1000/'
      const scope = nock(httpsUrl).delete('/').reply(200)

      await deleteRequest(
        deps,
        { url: httpsUrl },
        responseValidators.successfulValidator
      )

      expect(httpClient.delete).toHaveBeenCalledWith(httpsUrl, {
        headers: {}
      })
      scope.done()
    })

    test('uses http protocol for request if development environment', async (): Promise<void> => {
      const tmpDeps = createTestDeps({
        httpClient,
        useHttp: true
      })
      const httpsUrl = 'https://localhost:1000/'
      const httpUrl = httpsUrl.replace('https', 'http')
      const scope = nock(httpUrl).delete('/').reply(200)

      await deleteRequest(
        tmpDeps,
        { url: httpsUrl },
        responseValidators.successfulValidator
      )

      expect(httpClient.delete).toHaveBeenCalledWith(httpUrl, {
        headers: {}
      })
      scope.done()
    })
  })
})
