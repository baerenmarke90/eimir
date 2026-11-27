# ServerAdminProApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**createGiftCodeBatch**](ServerAdminProApi.md#creategiftcodebatch) | **POST** /api/v1/server-admin/pro/gift-code-batches | Create Gift Code Batch |
| [**getGiftCodeBatch**](ServerAdminProApi.md#getgiftcodebatch) | **GET** /api/v1/server-admin/pro/gift-code-batches/{batchId} | Get Gift Code Batch |
| [**getProOverview**](ServerAdminProApi.md#getprooverview) | **GET** /api/v1/server-admin/pro/overview | Get Pro Overview |
| [**revokeGiftCode**](ServerAdminProApi.md#revokegiftcode) | **POST** /api/v1/server-admin/pro/gift-codes/{codeId}/revoke | Revoke Gift Code |
| [**revokeGiftCodeBatch**](ServerAdminProApi.md#revokegiftcodebatch) | **POST** /api/v1/server-admin/pro/gift-code-batches/{batchId}/revoke | Revoke Gift Code Batch |
| [**setGiftCodeHandedOut**](ServerAdminProApi.md#setgiftcodehandedout) | **PUT** /api/v1/server-admin/pro/gift-codes/{codeId}/handed-out | Set Gift Code Handed Out |



## createGiftCodeBatch

> GiftCodeBatchView createGiftCodeBatch(giftCodeBatchCreate)

Create Gift Code Batch

Create a batch of fresh codes and return it with the plain codes.

### Example

```ts
import {
  Configuration,
  ServerAdminProApi,
} from '';
import type { CreateGiftCodeBatchRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ServerAdminProApi();

  const body = {
    // GiftCodeBatchCreate
    giftCodeBatchCreate: ...,
  } satisfies CreateGiftCodeBatchRequest;

  try {
    const data = await api.createGiftCodeBatch(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **giftCodeBatchCreate** | [GiftCodeBatchCreate](GiftCodeBatchCreate.md) |  | |

### Return type

[**GiftCodeBatchView**](GiftCodeBatchView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **201** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getGiftCodeBatch

> GiftCodeBatchView getGiftCodeBatch(batchId)

Get Gift Code Batch

One batch with each code\&#39;s state; a redeemed code names the Space by its id.

### Example

```ts
import {
  Configuration,
  ServerAdminProApi,
} from '';
import type { GetGiftCodeBatchRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ServerAdminProApi();

  const body = {
    // string
    batchId: batchId_example,
  } satisfies GetGiftCodeBatchRequest;

  try {
    const data = await api.getGiftCodeBatch(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **batchId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**GiftCodeBatchView**](GiftCodeBatchView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getProOverview

> ProOverviewView getProOverview()

Get Pro Overview

Pro figures, Google Play states, running gifts and the gift code batches.  Aggregates only: no names and no codes.

### Example

```ts
import {
  Configuration,
  ServerAdminProApi,
} from '';
import type { GetProOverviewRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ServerAdminProApi();

  try {
    const data = await api.getProOverview();
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters

This endpoint does not need any parameter.

### Return type

[**ProOverviewView**](ProOverviewView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## revokeGiftCode

> GiftCodeBatchView revokeGiftCode(codeId)

Revoke Gift Code

Revoke one unredeemed code; returns the code\&#39;s updated batch.

### Example

```ts
import {
  Configuration,
  ServerAdminProApi,
} from '';
import type { RevokeGiftCodeRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ServerAdminProApi();

  const body = {
    // string
    codeId: codeId_example,
  } satisfies RevokeGiftCodeRequest;

  try {
    const data = await api.revokeGiftCode(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **codeId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**GiftCodeBatchView**](GiftCodeBatchView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## revokeGiftCodeBatch

> GiftCodeBatchView revokeGiftCodeBatch(batchId)

Revoke Gift Code Batch

Revoke every unredeemed code of the batch; redeemed codes and their grants stay.

### Example

```ts
import {
  Configuration,
  ServerAdminProApi,
} from '';
import type { RevokeGiftCodeBatchRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ServerAdminProApi();

  const body = {
    // string
    batchId: batchId_example,
  } satisfies RevokeGiftCodeBatchRequest;

  try {
    const data = await api.revokeGiftCodeBatch(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **batchId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**GiftCodeBatchView**](GiftCodeBatchView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## setGiftCodeHandedOut

> GiftCodeBatchView setGiftCodeHandedOut(codeId, giftCodeHandedOutUpdate)

Set Gift Code Handed Out

Mark or unmark an open code as passed on; returns the code\&#39;s updated batch.

### Example

```ts
import {
  Configuration,
  ServerAdminProApi,
} from '';
import type { SetGiftCodeHandedOutRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ServerAdminProApi();

  const body = {
    // string
    codeId: codeId_example,
    // GiftCodeHandedOutUpdate
    giftCodeHandedOutUpdate: ...,
  } satisfies SetGiftCodeHandedOutRequest;

  try {
    const data = await api.setGiftCodeHandedOut(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **codeId** | `string` |  | [Defaults to `undefined`] |
| **giftCodeHandedOutUpdate** | [GiftCodeHandedOutUpdate](GiftCodeHandedOutUpdate.md) |  | |

### Return type

[**GiftCodeBatchView**](GiftCodeBatchView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

