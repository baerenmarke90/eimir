# PhotoSourcesApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**cancelPhotoSelection**](PhotoSourcesApi.md#cancelphotoselection) | **DELETE** /api/v1/spaces/{spaceId}/photo-selections/{selectionId} | Cancel |
| [**connectImmichPhotoSource**](PhotoSourcesApi.md#connectimmichphotosource) | **PUT** /api/v1/spaces/{spaceId}/photo-sources/immich | Connect |
| [**disconnectImmichPhotoSource**](PhotoSourcesApi.md#disconnectimmichphotosource) | **DELETE** /api/v1/spaces/{spaceId}/photo-sources/immich | Disconnect |
| [**getPhotoSources**](PhotoSourcesApi.md#getphotosources) | **GET** /api/v1/spaces/{spaceId}/photo-sources | Sources |
| [**pollPhotoSelection**](PhotoSourcesApi.md#pollphotoselection) | **POST** /api/v1/spaces/{spaceId}/photo-selections/{selectionId}/poll | Poll |
| [**readSelectedPhoto**](PhotoSourcesApi.md#readselectedphoto) | **POST** /api/v1/spaces/{spaceId}/photo-selections/{selectionId}/items/{itemId} | Read |
| [**startPhotoSelection**](PhotoSourcesApi.md#startphotoselection) | **POST** /api/v1/spaces/{spaceId}/photo-selections | Start |



## cancelPhotoSelection

> cancelPhotoSelection(selectionId, spaceId)

Cancel

### Example

```ts
import {
  Configuration,
  PhotoSourcesApi,
} from '';
import type { CancelPhotoSelectionRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PhotoSourcesApi();

  const body = {
    // string
    selectionId: selectionId_example,
    // string
    spaceId: spaceId_example,
  } satisfies CancelPhotoSelectionRequest;

  try {
    const data = await api.cancelPhotoSelection(body);
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
| **selectionId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |

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

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## connectImmichPhotoSource

> connectImmichPhotoSource(spaceId, ifMatch, photoSourceConnectionCreate)

Connect

### Example

```ts
import {
  Configuration,
  PhotoSourcesApi,
} from '';
import type { ConnectImmichPhotoSourceRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PhotoSourcesApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // string | The last-read opaque resource state, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
    // PhotoSourceConnectionCreate
    photoSourceConnectionCreate: ...,
  } satisfies ConnectImmichPhotoSourceRequest;

  try {
    const data = await api.connectImmichPhotoSource(body);
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
| **ifMatch** | `string` | The last-read opaque resource state, encoded as a strong ETag. Writes are rejected without this header. | [Defaults to `undefined`] |
| **photoSourceConnectionCreate** | [PhotoSourceConnectionCreate](PhotoSourceConnectionCreate.md) |  | |

### Return type

`void` (Empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **204** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |
| **429** | Too many attempts occurred within the allowed time window. |  -  |
| **503** | A capability required for this operation is not configured on this instance. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## disconnectImmichPhotoSource

> disconnectImmichPhotoSource(spaceId, ifMatch)

Disconnect

### Example

```ts
import {
  Configuration,
  PhotoSourcesApi,
} from '';
import type { DisconnectImmichPhotoSourceRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PhotoSourcesApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // string | The last-read opaque resource state, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
  } satisfies DisconnectImmichPhotoSourceRequest;

  try {
    const data = await api.disconnectImmichPhotoSource(body);
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
| **ifMatch** | `string` | The last-read opaque resource state, encoded as a strong ETag. Writes are rejected without this header. | [Defaults to `undefined`] |

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
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getPhotoSources

> PhotoSourceAvailability getPhotoSources(spaceId)

Sources

### Example

```ts
import {
  Configuration,
  PhotoSourcesApi,
} from '';
import type { GetPhotoSourcesRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PhotoSourcesApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies GetPhotoSourcesRequest;

  try {
    const data = await api.getPhotoSources(body);
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

[**PhotoSourceAvailability**](PhotoSourceAvailability.md)

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


## pollPhotoSelection

> PhotoSelectionView pollPhotoSelection(selectionId, spaceId, more)

Poll

### Example

```ts
import {
  Configuration,
  PhotoSourcesApi,
} from '';
import type { PollPhotoSelectionRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PhotoSourcesApi();

  const body = {
    // string
    selectionId: selectionId_example,
    // string
    spaceId: spaceId_example,
    // boolean (optional)
    more: true,
  } satisfies PollPhotoSelectionRequest;

  try {
    const data = await api.pollPhotoSelection(body);
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
| **selectionId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **more** | `boolean` |  | [Optional] [Defaults to `false`] |

### Return type

[**PhotoSelectionView**](PhotoSelectionView.md)

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
| **429** | Too many attempts occurred within the allowed time window. |  -  |
| **503** | A capability required for this operation is not configured on this instance. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## readSelectedPhoto

> Blob readSelectedPhoto(selectionId, itemId, spaceId, thumbnail)

Read

### Example

```ts
import {
  Configuration,
  PhotoSourcesApi,
} from '';
import type { ReadSelectedPhotoRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PhotoSourcesApi();

  const body = {
    // string
    selectionId: selectionId_example,
    // string
    itemId: itemId_example,
    // string
    spaceId: spaceId_example,
    // boolean (optional)
    thumbnail: true,
  } satisfies ReadSelectedPhotoRequest;

  try {
    const data = await api.readSelectedPhoto(body);
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
| **selectionId** | `string` |  | [Defaults to `undefined`] |
| **itemId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **thumbnail** | `boolean` |  | [Optional] [Defaults to `false`] |

### Return type

**Blob**

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/octet-stream`, `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **429** | Too many attempts occurred within the allowed time window. |  -  |
| **503** | A capability required for this operation is not configured on this instance. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## startPhotoSelection

> PhotoSelectionView startPhotoSelection(spaceId, photoSelectionCreate)

Start

### Example

```ts
import {
  Configuration,
  PhotoSourcesApi,
} from '';
import type { StartPhotoSelectionRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PhotoSourcesApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // PhotoSelectionCreate
    photoSelectionCreate: ...,
  } satisfies StartPhotoSelectionRequest;

  try {
    const data = await api.startPhotoSelection(body);
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
| **photoSelectionCreate** | [PhotoSelectionCreate](PhotoSelectionCreate.md) |  | |

### Return type

[**PhotoSelectionView**](PhotoSelectionView.md)

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
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |
| **429** | Too many attempts occurred within the allowed time window. |  -  |
| **503** | A capability required for this operation is not configured on this instance. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

