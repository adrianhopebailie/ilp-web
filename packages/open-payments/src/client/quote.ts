import { HttpMethod, ResponseValidator } from '@interledger/openapi'
import { ResourceRequestArgs, BaseDeps, RouteDeps } from '.'
import { CreateQuoteArgs, getRSPath, Quote } from '../types'
import { get, post } from './requests'

export interface QuoteRoutes {
  get(args: ResourceRequestArgs): Promise<Quote>
  create(
    createArgs: ResourceRequestArgs,
    createQuoteArgs: CreateQuoteArgs
  ): Promise<Quote>
}

export const createQuoteRoutes = (deps: RouteDeps): QuoteRoutes => {
  const { openApi, ...baseDeps } = deps

  let getQuoteOpenApiValidator: ResponseValidator<Quote>
  let createQuoteOpenApiValidator: ResponseValidator<Quote>

  if (deps.validateResponses) {
    getQuoteOpenApiValidator = openApi.createResponseValidator({
      path: getRSPath('/quotes/{id}'),
      method: HttpMethod.GET
    })

    createQuoteOpenApiValidator = openApi.createResponseValidator({
      path: getRSPath('/quotes'),
      method: HttpMethod.POST
    })
  }

  return {
    get: (args: ResourceRequestArgs) =>
      getQuote(baseDeps, args, getQuoteOpenApiValidator),
    create: (
      createArgs: ResourceRequestArgs,
      createQuoteArgs: CreateQuoteArgs
    ) =>
      createQuote(
        baseDeps,
        createArgs,
        createQuoteOpenApiValidator,
        createQuoteArgs
      )
  }
}

export const getQuote = async (
  deps: BaseDeps,
  args: ResourceRequestArgs,
  validateOpenApiResponse: ResponseValidator<Quote>
) => {
  const quote = await get(deps, args, validateOpenApiResponse)

  return quote
}

export const createQuote = async (
  deps: BaseDeps,
  createArgs: ResourceRequestArgs,
  validateOpenApiResponse: ResponseValidator<Quote>,
  createQuoteArgs: CreateQuoteArgs
) => {
  const { accessToken, url: baseUrl } = createArgs
  const url = `${baseUrl}${getRSPath('/quotes')}`

  const quote = await post(
    deps,
    { url, accessToken, body: createQuoteArgs },
    validateOpenApiResponse
  )

  return quote
}
