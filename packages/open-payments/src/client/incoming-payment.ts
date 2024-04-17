import { HttpMethod, ResponseValidator } from '@interledger/openapi'
import {
  BaseDeps,
  ResourceRequestArgs,
  CollectionRequestArgs,
  RouteDeps,
  UnauthenticatedResourceRequestArgs
} from '.'
import {
  IncomingPayment,
  getRSPath,
  CreateIncomingPaymentArgs,
  PaginationArgs,
  IncomingPaymentPaginationResult,
  PublicIncomingPayment,
  IncomingPaymentWithPaymentMethods
} from '../types'
import { get, post } from './requests'
import { handleValidationError } from './validation-error'

type AnyIncomingPayment = IncomingPayment | IncomingPaymentWithPaymentMethods

export interface IncomingPaymentRoutes {
  get(args: ResourceRequestArgs): Promise<IncomingPaymentWithPaymentMethods>
  getPublic(
    args: UnauthenticatedResourceRequestArgs
  ): Promise<PublicIncomingPayment>
  create(
    args: ResourceRequestArgs,
    createArgs: CreateIncomingPaymentArgs
  ): Promise<IncomingPaymentWithPaymentMethods>
  complete(args: ResourceRequestArgs): Promise<IncomingPayment>
  list(
    args: CollectionRequestArgs,
    pagination?: PaginationArgs
  ): Promise<IncomingPaymentPaginationResult>
}

export const createIncomingPaymentRoutes = (
  deps: RouteDeps
): IncomingPaymentRoutes => {
  const { openApi, ...baseDeps } = deps

  let getIncomingPaymentOpenApiValidator: ResponseValidator<IncomingPaymentWithPaymentMethods>
  let getPublicIncomingPaymentOpenApiValidator: ResponseValidator<PublicIncomingPayment>
  let createIncomingPaymentOpenApiValidator: ResponseValidator<IncomingPaymentWithPaymentMethods>
  let completeIncomingPaymentOpenApiValidator: ResponseValidator<IncomingPayment>
  let listIncomingPaymentOpenApiValidator: ResponseValidator<IncomingPaymentPaginationResult>

  if (deps.validateResponses) {
    getIncomingPaymentOpenApiValidator = openApi.createResponseValidator({
      path: getRSPath('/incoming-payments/{id}'),
      method: HttpMethod.GET
    })

    getPublicIncomingPaymentOpenApiValidator = openApi.createResponseValidator({
      path: getRSPath('/incoming-payments/{id}'),
      method: HttpMethod.GET
    })

    createIncomingPaymentOpenApiValidator = openApi.createResponseValidator({
      path: getRSPath('/incoming-payments'),
      method: HttpMethod.POST
    })

    completeIncomingPaymentOpenApiValidator = openApi.createResponseValidator({
      path: getRSPath('/incoming-payments/{id}/complete'),
      method: HttpMethod.POST
    })

    listIncomingPaymentOpenApiValidator = openApi.createResponseValidator({
      path: getRSPath('/incoming-payments'),
      method: HttpMethod.GET
    })
  }

  return {
    get: (args: ResourceRequestArgs) =>
      getIncomingPayment(baseDeps, args, getIncomingPaymentOpenApiValidator),
    getPublic: (args: UnauthenticatedResourceRequestArgs) =>
      getPublicIncomingPayment(
        baseDeps,
        args,
        getPublicIncomingPaymentOpenApiValidator
      ),
    create: (
      requestArgs: ResourceRequestArgs,
      createArgs: CreateIncomingPaymentArgs
    ) =>
      createIncomingPayment(
        baseDeps,
        requestArgs,
        createArgs,
        createIncomingPaymentOpenApiValidator
      ),
    complete: (args: ResourceRequestArgs) =>
      completeIncomingPayment(
        baseDeps,
        args,
        completeIncomingPaymentOpenApiValidator
      ),
    list: (args: CollectionRequestArgs, pagination?: PaginationArgs) =>
      listIncomingPayment(
        baseDeps,
        args,
        listIncomingPaymentOpenApiValidator,
        pagination
      )
  }
}

export interface UnauthenticatedIncomingPaymentRoutes {
  get(args: UnauthenticatedResourceRequestArgs): Promise<PublicIncomingPayment>
}

export const createUnauthenticatedIncomingPaymentRoutes = (
  deps: RouteDeps
): UnauthenticatedIncomingPaymentRoutes => {
  const { openApi, ...baseDeps } = deps

  let getPublicIncomingPaymentOpenApiValidator: ResponseValidator<PublicIncomingPayment>

  if (deps.validateResponses) {
    getPublicIncomingPaymentOpenApiValidator = openApi.createResponseValidator({
      path: getRSPath('/incoming-payments/{id}'),
      method: HttpMethod.GET
    })
  }

  return {
    get: (args: UnauthenticatedResourceRequestArgs) =>
      getPublicIncomingPayment(
        baseDeps,
        args,
        getPublicIncomingPaymentOpenApiValidator
      )
  }
}

export const getIncomingPayment = async (
  deps: BaseDeps,
  args: ResourceRequestArgs,
  validateOpenApiResponse?: ResponseValidator<IncomingPaymentWithPaymentMethods>
) => {
  const { url } = args

  const incomingPayment = await get(
    deps,
    {
      ...args
    },
    validateOpenApiResponse
  )

  try {
    return validateIncomingPayment(incomingPayment)
  } catch (error) {
    return handleValidationError(
      deps,
      error,
      url,
      'Could not validate incoming payment'
    )
  }
}

export const getPublicIncomingPayment = async (
  deps: BaseDeps,
  args: UnauthenticatedResourceRequestArgs,
  validateOpenApiResponse?: ResponseValidator<PublicIncomingPayment>
) => {
  return await get(deps, args, validateOpenApiResponse)
}

export const createIncomingPayment = async (
  deps: BaseDeps,
  requestArgs: ResourceRequestArgs,
  createArgs: CreateIncomingPaymentArgs,
  validateOpenApiResponse?: ResponseValidator<IncomingPaymentWithPaymentMethods>
) => {
  const { url: baseUrl, accessToken } = requestArgs
  const url = `${baseUrl}${getRSPath('/incoming-payments')}`

  const incomingPayment = await post(
    deps,
    { url, accessToken, body: createArgs },
    validateOpenApiResponse
  )

  try {
    return validateCreatedIncomingPayment(incomingPayment)
  } catch (error) {
    return handleValidationError(
      deps,
      error,
      url,
      'Could not create incoming payment'
    )
  }
}

export const completeIncomingPayment = async (
  deps: BaseDeps,
  args: ResourceRequestArgs,
  validateOpenApiResponse?: ResponseValidator<IncomingPayment>
) => {
  const { url: incomingPaymentUrl, accessToken } = args
  const url = `${incomingPaymentUrl}/complete`

  const incomingPayment = await post(
    deps,
    { url, accessToken },
    validateOpenApiResponse
  )

  try {
    return validateCompletedIncomingPayment(incomingPayment)
  } catch (error) {
    return handleValidationError(
      deps,
      error,
      url,
      'Could not complete incoming payment'
    )
  }
}

export const listIncomingPayment = async (
  deps: BaseDeps,
  args: CollectionRequestArgs,
  validateOpenApiResponse?: ResponseValidator<IncomingPaymentPaginationResult>,
  pagination?: PaginationArgs
) => {
  const { url: baseUrl, accessToken, walletAddress } = args

  const url = `${baseUrl}${getRSPath('/incoming-payments')}`

  const incomingPayments = await get(
    deps,
    {
      url,
      accessToken,
      ...(pagination
        ? { queryParams: { ...pagination, 'wallet-address': walletAddress } }
        : { queryParams: { 'wallet-address': walletAddress } })
    },
    validateOpenApiResponse
  )

  for (const incomingPayment of incomingPayments.result) {
    try {
      validateIncomingPayment(incomingPayment)
    } catch (error) {
      return handleValidationError(
        deps,
        error,
        url,
        'Could not validate an incoming payment'
      )
    }
  }

  return incomingPayments
}

export const validateIncomingPayment = <T extends AnyIncomingPayment>(
  payment: T
): T => {
  if (payment.incomingAmount) {
    const { incomingAmount, receivedAmount } = payment
    if (
      incomingAmount.assetCode !== receivedAmount.assetCode ||
      incomingAmount.assetScale !== receivedAmount.assetScale
    ) {
      throw new Error(
        'Incoming amount asset code or asset scale does not match up received amount'
      )
    }
  }

  return payment
}

export const validateCreatedIncomingPayment = (
  payment: IncomingPaymentWithPaymentMethods
): IncomingPaymentWithPaymentMethods => {
  const { receivedAmount, completed } = payment

  if (BigInt(receivedAmount.value) !== BigInt(0)) {
    throw new Error('Received amount is a non-zero value')
  }

  if (completed) {
    throw new Error('Can not create a completed incoming payment')
  }

  return validateIncomingPayment(payment)
}

export const validateCompletedIncomingPayment = (
  payment: IncomingPayment
): IncomingPayment => {
  const { completed } = payment

  if (!completed) {
    throw new Error('Incoming payment could not be completed')
  }

  return validateIncomingPayment(payment)
}
