/* eslint-disable max-params */
import { type AxiosRequestConfig, type AxiosResponseHeaders } from 'axios';

import { isBrowser, isPersonalAccessToken, mergeConfig } from './utils.js';
import { type FetchAPIOptions, fetchAPI } from './fetcher.js';
import { APIError, type ErrorRes } from './error.js';
import * as Errors from './error.js';
import { DEFAULT_BASE_URL } from './constant.js';

export type RequestOptions = Omit<
  AxiosRequestConfig,
  'url' | 'method' | 'baseURL' | 'data' | 'responseType'
>;
export interface ClientOptions {
  baseURL?: string;
  token: string;
  // see https://github.com/axios/axios?tab=readme-ov-file#request-config
  axiosOptions?: RequestOptions;
  debug?: boolean;
  headers?: Headers | undefined;
  //  Whether Personal Access Tokens (PAT) are allowed in browser environments
  allowPersonalAccessTokenInBrowser?: boolean;
}

export class APIClient {
  protected _config: ClientOptions;
  baseURL: string;
  token: string;
  axiosOptions?: RequestOptions;
  debug: boolean;
  allowPersonalAccessTokenInBrowser: boolean;
  headers?: Headers;

  constructor(config: ClientOptions) {
    this._config = config;
    this.baseURL = config.baseURL || DEFAULT_BASE_URL;
    this.token = config.token;
    this.axiosOptions = config.axiosOptions || {};
    this.debug = config.debug || false;
    this.allowPersonalAccessTokenInBrowser =
      config.allowPersonalAccessTokenInBrowser || false;
    this.headers = config.headers;

    if (
      isBrowser() &&
      isPersonalAccessToken(this.token) &&
      !this.allowPersonalAccessTokenInBrowser
    ) {
      throw new Errors.CozeError(
        'Browser environments do not support authentication using Personal Access Token (PAT) by default.\nas it may expose secret API keys. \n\nPlease use OAuth2.0 authentication mechanism. see:\nhttps://www.coze.com/docs/developer_guides/oauth_apps?_lang=en \n\nIf you need to force use, please set the `allowPersonalAccessTokenInBrowser` option to `true`. \n\ne.g new CozeAPI({ token, allowPersonalAccessTokenInBrowser: true });\n\n',
      );
    }
  }

  static APIError = Errors.APIError;
  static BadRequestError = Errors.BadRequestError;
  static AuthenticationError = Errors.AuthenticationError;
  static PermissionDeniedError = Errors.PermissionDeniedError;
  static NotFoundError = Errors.NotFoundError;
  static RateLimitError = Errors.RateLimitError;
  static InternalServerError = Errors.InternalServerError;
  static GatewayError = Errors.GatewayError;
  static TimeoutError = Errors.TimeoutError;
  static UserAbortError = Errors.APIUserAbortError;

  protected buildOptions(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    body?: unknown,
    options?: RequestOptions,
  ): FetchAPIOptions {
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.token}`,
    };
    // FIXME: browser 下存在跨域问题，后续再看看
    if (!isBrowser()) {
      headers['agw-js-conv'] = 'str';
    }
    const config = mergeConfig(this.axiosOptions, options, { headers });
    config.method = method;
    config.data = body;

    return config;
  }
  protected async makeRequest<Req, Rsp>(
    apiUrl: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    body?: Req,
    isStream?: boolean,
    options?: RequestOptions,
  ): Promise<Rsp> {
    const fullUrl = `${this.baseURL}${apiUrl}`;

    const fetchOptions = this.buildOptions(method, body, options);
    fetchOptions.isStreaming = isStream;

    this.debugLog(`--- request url: ${fullUrl}`);
    this.debugLog('--- request options:', fetchOptions);

    const { response, stream, json } = await fetchAPI(fullUrl, fetchOptions);

    this.debugLog(`--- response status: ${response.status}`);
    this.debugLog('--- response headers: ', response.headers);

    const contentType = response.headers['content-type'];

    if (isStream) {
      if (contentType && contentType.includes('application/json')) {
        const result = (await json()) as { code: number; msg: string } & Record<
          string,
          unknown
        >;
        const { code, msg } = result;
        if (code !== 0 && code !== undefined) {
          throw APIError.generate(
            response.status,
            result as ErrorRes,
            msg,
            response.headers as AxiosResponseHeaders,
          );
        }
      }
      return stream() as Rsp;
    }

    if (contentType && contentType.includes('application/json')) {
      const result = (await json()) as { code: number; msg: string } & Record<
        string,
        unknown
      >;
      const { code, msg } = result;
      if (code !== 0 && code !== undefined) {
        throw APIError.generate(
          response.status,
          result as ErrorRes,
          msg,
          response.headers as AxiosResponseHeaders,
        );
      }

      return result as Rsp;
    } else {
      return (await response.data) as Rsp;
    }
  }

  async post<Req, Rsp>(
    apiUrl: string,
    body?: Req,
    isStream = false,
    options?: RequestOptions,
  ): Promise<Rsp> {
    return this.makeRequest<Req, Rsp>(apiUrl, 'POST', body, isStream, options);
  }

  async get<Req, Rsp>(
    apiUrl: string,
    param?: Req,
    isStream?: boolean,
    options?: RequestOptions,
  ): Promise<Rsp> {
    // 拼接参数
    const queryString = Object.entries(param || {})
      .map(([key, value]) => `${key}=${value}`)
      .join('&');
    return this.makeRequest<Req, Rsp>(
      queryString
        ? `${apiUrl}${apiUrl.includes('?') ? '&' : '?'}${queryString}`
        : apiUrl,
      'GET',
      undefined,
      isStream,
      options,
    );
  }

  async put<Req, Rsp>(
    apiUrl: string,
    body?: Req,
    isStream?: boolean,
    options?: RequestOptions,
  ): Promise<Rsp> {
    return this.makeRequest<Req, Rsp>(apiUrl, 'PUT', body, isStream, options);
  }

  async delete<Req, Rsp>(
    apiUrl: string,
    isStream?: boolean,
    options?: RequestOptions,
  ): Promise<Rsp> {
    return this.makeRequest<Req, Rsp>(
      apiUrl,
      'DELETE',
      undefined,
      isStream,
      options,
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected debugLog(...msgs: any[]) {
    if (this.debug) {
      console.debug(...msgs);
    }
  }
}