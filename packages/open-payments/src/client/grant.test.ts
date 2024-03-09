/* eslint-disable @typescript-eslint/no-explicit-any */
import { createGrantRoutes } from './grant'
import { OpenAPI, HttpMethod, createOpenAPI } from '@interledger/openapi'
import path from 'path'
import { createTestDeps, mockGrantRequest } from '../test/helpers'
import * as requestors from './requests'
import { v4 as uuid } from 'uuid'

jest.mock('./requests', () => ({
  ...jest.requireActual('./requests.ts'),
  deleteRequest: jest.fn(),
  post: jest.fn(),
  get: jest.fn()
}))

describe('grant', (): void => {
  let openApi: OpenAPI

  beforeAll(async () => {
    openApi = await createOpenAPI(
      path.resolve(__dirname, '../openapi/auth-server.yaml')
    )
  })

  const deps = createTestDeps()
  const client = 'https://example.com/.well-known/pay'

  describe('routes', () => {
    const url = 'http://localhost:1000'
    const accessToken = 'someAccessToken'

    describe('request', () => {
      test('calls post method with correct validator', async (): Promise<void> => {
        const mockResponseValidator = ({ path, method }) =>
          path === '/' && method === HttpMethod.POST

        jest
          .spyOn(openApi, 'createResponseValidator')
          .mockImplementation(mockResponseValidator as any)

        const postSpy = jest.spyOn(requestors, 'post')
        const grantRequest = mockGrantRequest()

        await createGrantRoutes({ openApi, client, ...deps }).request(
          { url },
          grantRequest
        )

        expect(postSpy).toHaveBeenCalledWith(
          deps,
          {
            url,
            body: {
              ...grantRequest,
              client
            }
          },
          true
        )
      })
    })

    describe('cancel', () => {
      test('calls delete method with correct validator', async (): Promise<void> => {
        const mockResponseValidator = ({ path, method }) =>
          path === '/continue/{id}' && method === HttpMethod.DELETE

        jest
          .spyOn(openApi, 'createResponseValidator')
          .mockImplementation(mockResponseValidator as any)

        const deleteSpy = jest
          .spyOn(requestors, 'deleteRequest')
          .mockResolvedValueOnce()

        await createGrantRoutes({ openApi, client, ...deps }).cancel({
          url,
          accessToken
        })

        expect(deleteSpy).toHaveBeenCalledWith(deps, { url, accessToken }, true)
      })
    })

    describe('continue', () => {
      describe('calls post method with correct validator', (): void => {
        test('with interact_ref', async (): Promise<void> => {
          const mockResponseValidator = ({ path, method }) =>
            path === '/continue/{id}' && method === HttpMethod.POST

          jest
            .spyOn(openApi, 'createResponseValidator')
            .mockImplementation(mockResponseValidator as any)

          const postSpy = jest.spyOn(requestors, 'post')
          const interact_ref = uuid()

          await createGrantRoutes({ openApi, client, ...deps }).continue(
            {
              url,
              accessToken
            },
            { interact_ref }
          )

          expect(postSpy).toHaveBeenCalledWith(
            deps,
            { url, accessToken, body: { interact_ref } },
            true
          )
        })
      })
      test('without interact_ref', async (): Promise<void> => {
        const mockResponseValidator = ({ path, method }) =>
          path === '/continue/{id}' && method === HttpMethod.POST

        jest
          .spyOn(openApi, 'createResponseValidator')
          .mockImplementation(mockResponseValidator as any)

        const postSpy = jest.spyOn(requestors, 'post')
        const body = {}

        await createGrantRoutes({ openApi, client, ...deps }).continue(
          {
            url,
            accessToken
          },
          body
        )

        expect(postSpy).toHaveBeenCalledWith(
          deps,
          { url, accessToken, body },
          true
        )
      })
      test('without body', async (): Promise<void> => {
        const mockResponseValidator = ({ path, method }) =>
          path === '/continue/{id}' && method === HttpMethod.POST

        jest
          .spyOn(openApi, 'createResponseValidator')
          .mockImplementation(mockResponseValidator as any)

        const postSpy = jest.spyOn(requestors, 'post')

        await createGrantRoutes({ openApi, client, ...deps }).continue({
          url,
          accessToken
        })

        expect(postSpy).toHaveBeenCalledWith(deps, { url, accessToken }, true)
      })
    })
  })
})
