import $RefParser from '@apidevtools/json-schema-ref-parser'
import Ajv2020, { ErrorObject } from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import OpenAPIDefaultSetter from 'openapi-default-setter'
import OpenapiRequestCoercer from 'openapi-request-coercer'
import OpenAPIRequestValidator from 'openapi-request-validator'
import OpenAPIResponseValidator, {
  OpenAPIResponseValidatorError
} from 'openapi-response-validator'
import { OpenAPIV3, OpenAPIV3_1 } from 'openapi-types'

export { $RefParser }
export {
  createValidatorMiddleware,
  OpenAPIValidatorMiddlewareError
} from './middleware'
export const HttpMethod = {
  ...OpenAPIV3.HttpMethods
}
export type HttpMethod = OpenAPIV3.HttpMethods
export { OpenAPIV3_1 }

const ajv = new Ajv2020()
addFormats(ajv)

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isHttpMethod = (o: any): o is HttpMethod =>
  Object.values(HttpMethod).includes(o)

export async function createOpenAPI(
  spec: string | OpenAPIV3_1.Document
): Promise<OpenAPI> {
  return new OpenAPIImpl(
    typeof spec === 'string'
      ? ((await $RefParser.dereference(spec)) as OpenAPIV3_1.Document)
      : spec
  )
}

// Replace OpenAPIV3_1.PathsObject and its possibly undefined paths:
// export interface PathsObject<T extends {} = {}, P extends {} = {}> {
//   [pattern: string]: (PathItemObject<T> & P) | undefined;
// }
interface Paths<
  T extends Record<string, unknown> = Record<string, unknown>,
  P extends Record<string, unknown> = Record<string, unknown>
> {
  [pattern: string]: OpenAPIV3_1.PathItemObject<T> & P
}

export interface RequestOptions {
  path: string
  method: HttpMethod
}

export interface Response {
  status: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any
}

interface ValidatedResponse<BodyT> {
  status: number
  body: BodyT
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RequestValidator<T> = (request: any) => request is T
export type ResponseValidator<BodyT> = (
  response: Response
) => response is ValidatedResponse<BodyT>

export interface OpenAPI {
  paths: Paths
  createRequestValidator<T>(options: RequestOptions): RequestValidator<T>
  createResponseValidator<BodyT>(
    options: RequestOptions
  ): ResponseValidator<BodyT>
}

class OpenAPIImpl implements OpenAPI {
  constructor(spec: OpenAPIV3_1.Document) {
    if (!spec.paths) {
      throw new Error()
    }
    this.paths = spec.paths as Paths
  }
  public paths: Paths

  public createRequestValidator<T>({ path, method }: RequestOptions) {
    const operation = this.paths[path]?.[method]
    if (!operation) {
      throw new Error()
    }

    const queryParams = operation.parameters as OpenAPIV3_1.ParameterObject[]
    const coercer =
      queryParams &&
      new OpenapiRequestCoercer({
        parameters: queryParams
      })
    const defaultSetter =
      queryParams &&
      new OpenAPIDefaultSetter({
        parameters: queryParams
      })

    const parameters = queryParams || []
    if (this.paths[path].parameters) {
      parameters.push(
        ...(this.paths[path].parameters as OpenAPIV3_1.ParameterObject[])
      )
    }
    const requestValidator = new OpenAPIRequestValidator({
      parameters,
      // OpenAPIRequestValidator hasn't been updated with OpenAPIV3_1 types
      requestBody: operation.requestBody as OpenAPIV3.RequestBodyObject,
      errorTransformer,
      customFormats
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (request: any): request is T => {
      if (coercer) {
        coercer.coerce(request)
      }
      if (defaultSetter) {
        defaultSetter.handle(request)
      }
      const errors = requestValidator.validateRequest(request)
      if (errors) {
        throw errors
      }
      return true
    }
  }

  public createResponseValidator<T>({ path, method }: RequestOptions) {
    const responses = this.paths[path]?.[method]?.responses
    if (!responses) {
      throw new Error()
    }

    const responseValidator = new OpenAPIResponseValidator({
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore: OpenAPIResponseValidator supports v3 responses but its types aren't updated
      responses,
      errorTransformer,
      customFormats
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (response: Response): response is ValidatedResponse<T> => {
      const errors = responseValidator.validateResponse(
        response.status.toString(),
        response.body
      )
      if (errors) {
        throw errors
      }
      return true
    }
  }
}

interface TransformedError {
  message: string
}

const errorTransformer = (
  _openapiError: OpenAPIResponseValidatorError,
  ajvError: ErrorObject
): TransformedError => {
  // Remove preceding 'data/'
  // Delineate subfields with '.'
  const message = ajv.errorsText([ajvError]).slice(5).replace(/\//g, '.')
  const additionalProperty =
    ajvError.keyword === 'additionalProperties'
      ? `: ${ajvError.params.additionalProperty}`
      : ''
  return {
    message: message + additionalProperty
  }
}

const customFormats = {
  uint64: function (input: string | number) {
    try {
      const value = BigInt(input)
      return value >= BigInt(0)
    } catch (e) {
      return false
    }
  }
}

export interface ValidationError {
  status?: number
  errors: TransformedError[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const isValidationError = (err: any): err is ValidationError =>
  Array.isArray(err.errors)
