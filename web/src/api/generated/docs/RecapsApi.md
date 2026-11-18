# RecapsApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**getRecapOverview**](RecapsApi.md#getrecapoverview) | **GET** /api/v1/spaces/{spaceId}/recaps | Overview |
| [**getRecapSelection**](RecapsApi.md#getrecapselection) | **GET** /api/v1/spaces/{spaceId}/recaps/{recapId}/selection | Get Selection |
| [**getRelationshipRecap**](RecapsApi.md#getrelationshiprecap) | **GET** /api/v1/spaces/{spaceId}/recaps/{recapId} | Get Recap |
| [**prepareRelationshipRecaps**](RecapsApi.md#preparerelationshiprecaps) | **POST** /api/v1/spaces/{spaceId}/recaps/prepare | Prepare |
| [**requestRelationshipRecap**](RecapsApi.md#requestrelationshiprecap) | **POST** /api/v1/spaces/{spaceId}/recaps | Request Recap |
| [**saveRecapEdition**](RecapsApi.md#saverecapedition) | **POST** /api/v1/spaces/{spaceId}/recaps/{recapId}/save | Save |
| [**updateRecapReflection**](RecapsApi.md#updaterecapreflection) | **PUT** /api/v1/spaces/{spaceId}/recaps/{recapId}/reflection | Reflect |
| [**updateRecapSelection**](RecapsApi.md#updaterecapselection) | **PUT** /api/v1/spaces/{spaceId}/recaps/{recapId}/selection | Update Selection |
| [**withdrawRecapReflection**](RecapsApi.md#withdrawrecapreflection) | **DELETE** /api/v1/spaces/{spaceId}/recaps/{recapId}/reflection | Withdraw |



## getRecapOverview

> RecapOverview getRecapOverview(spaceId, offset, kind)

Overview

### Example

```ts
import {
  Configuration,
  RecapsApi,
} from '';
import type { GetRecapOverviewRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new RecapsApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // number (optional)
    offset: 56,
    // RecapKind (optional)
    kind: ...,
  } satisfies GetRecapOverviewRequest;

  try {
    const data = await api.getRecapOverview(body);
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
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **offset** | `number` |  | [Optional] [Defaults to `0`] |
| **kind** | `RecapKind` |  | [Optional] [Defaults to `undefined`] [Enum: MONTH, YEAR] |

### Return type

[**RecapOverview**](RecapOverview.md)

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
| **404** | The resource does not exist or is not visible to the caller. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getRecapSelection

> RecapSelectionView getRecapSelection(recapId, spaceId)

Get Selection

### Example

```ts
import {
  Configuration,
  RecapsApi,
} from '';
import type { GetRecapSelectionRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new RecapsApi();

  const body = {
    // string
    recapId: recapId_example,
    // string
    spaceId: spaceId_example,
  } satisfies GetRecapSelectionRequest;

  try {
    const data = await api.getRecapSelection(body);
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
| **recapId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**RecapSelectionView**](RecapSelectionView.md)

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


## getRelationshipRecap

> RecapView getRelationshipRecap(recapId, spaceId)

Get Recap

### Example

```ts
import {
  Configuration,
  RecapsApi,
} from '';
import type { GetRelationshipRecapRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new RecapsApi();

  const body = {
    // string
    recapId: recapId_example,
    // string
    spaceId: spaceId_example,
  } satisfies GetRelationshipRecapRequest;

  try {
    const data = await api.getRelationshipRecap(body);
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
| **recapId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**RecapView**](RecapView.md)

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
| **404** | The resource does not exist or is not visible to the caller. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## prepareRelationshipRecaps

> any prepareRelationshipRecaps(spaceId)

Prepare

### Example

```ts
import {
  Configuration,
  RecapsApi,
} from '';
import type { PrepareRelationshipRecapsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new RecapsApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies PrepareRelationshipRecapsRequest;

  try {
    const data = await api.prepareRelationshipRecaps(body);
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
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

**any**

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **202** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## requestRelationshipRecap

> RecapView requestRelationshipRecap(spaceId, recapRequest)

Request Recap

### Example

```ts
import {
  Configuration,
  RecapsApi,
} from '';
import type { RequestRelationshipRecapRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new RecapsApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // RecapRequest
    recapRequest: ...,
  } satisfies RequestRelationshipRecapRequest;

  try {
    const data = await api.requestRelationshipRecap(body);
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
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **recapRequest** | [RecapRequest](RecapRequest.md) |  | |

### Return type

[**RecapView**](RecapView.md)

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


## saveRecapEdition

> RecapView saveRecapEdition(recapId, spaceId, ifMatch)

Save

### Example

```ts
import {
  Configuration,
  RecapsApi,
} from '';
import type { SaveRecapEditionRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new RecapsApi();

  const body = {
    // string
    recapId: recapId_example,
    // string
    spaceId: spaceId_example,
    // string | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
  } satisfies SaveRecapEditionRequest;

  try {
    const data = await api.saveRecapEdition(body);
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
| **recapId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **ifMatch** | `string` | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header. | [Defaults to `undefined`] |

### Return type

[**RecapView**](RecapView.md)

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
| **409** | The request conflicts with the current state of the resource. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## updateRecapReflection

> RecapView updateRecapReflection(recapId, spaceId, recapReflectionUpdate)

Reflect

### Example

```ts
import {
  Configuration,
  RecapsApi,
} from '';
import type { UpdateRecapReflectionRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new RecapsApi();

  const body = {
    // string
    recapId: recapId_example,
    // string
    spaceId: spaceId_example,
    // RecapReflectionUpdate
    recapReflectionUpdate: ...,
  } satisfies UpdateRecapReflectionRequest;

  try {
    const data = await api.updateRecapReflection(body);
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
| **recapId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **recapReflectionUpdate** | [RecapReflectionUpdate](RecapReflectionUpdate.md) |  | |

### Return type

[**RecapView**](RecapView.md)

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
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## updateRecapSelection

> RecapView updateRecapSelection(recapId, spaceId, ifMatch, recapSelectionUpdate)

Update Selection

### Example

```ts
import {
  Configuration,
  RecapsApi,
} from '';
import type { UpdateRecapSelectionRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new RecapsApi();

  const body = {
    // string
    recapId: recapId_example,
    // string
    spaceId: spaceId_example,
    // string | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
    // RecapSelectionUpdate
    recapSelectionUpdate: ...,
  } satisfies UpdateRecapSelectionRequest;

  try {
    const data = await api.updateRecapSelection(body);
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
| **recapId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **ifMatch** | `string` | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header. | [Defaults to `undefined`] |
| **recapSelectionUpdate** | [RecapSelectionUpdate](RecapSelectionUpdate.md) |  | |

### Return type

[**RecapView**](RecapView.md)

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
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## withdrawRecapReflection

> withdrawRecapReflection(recapId, spaceId, ifMatch)

Withdraw

### Example

```ts
import {
  Configuration,
  RecapsApi,
} from '';
import type { WithdrawRecapReflectionRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new RecapsApi();

  const body = {
    // string
    recapId: recapId_example,
    // string
    spaceId: spaceId_example,
    // string | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
  } satisfies WithdrawRecapReflectionRequest;

  try {
    const data = await api.withdrawRecapReflection(body);
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
| **recapId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **ifMatch** | `string` | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header. | [Defaults to `undefined`] |

### Return type

`void` (Empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **204** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

