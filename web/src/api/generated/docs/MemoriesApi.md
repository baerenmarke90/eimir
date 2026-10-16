# MemoriesApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**createMemory**](MemoriesApi.md#creatememory) | **POST** /api/v1/spaces/{spaceId}/memories | Create Memory |
| [**deleteMemory**](MemoriesApi.md#deletememory) | **DELETE** /api/v1/spaces/{spaceId}/memories/{memoryId} | Delete Memory |
| [**getMemory**](MemoriesApi.md#getmemory) | **GET** /api/v1/spaces/{spaceId}/memories/{memoryId} | Get Memory |
| [**listMemories**](MemoriesApi.md#listmemories) | **GET** /api/v1/spaces/{spaceId}/memories | List Memories |
| [**replaceMemoryAttachments**](MemoriesApi.md#replacememoryattachments) | **PUT** /api/v1/spaces/{spaceId}/memories/{memoryId}/attachments | Replace Memory Attachments |
| [**updateMemory**](MemoriesApi.md#updatememory) | **PATCH** /api/v1/spaces/{spaceId}/memories/{memoryId} | Update Memory |



## createMemory

> MemoryDetail createMemory(spaceId, memoryCreate, idempotencyKey)

Create Memory

Create a Memory.  Send an &#x60;Idempotency-Key&#x60; to make the save reconcilable after a lost response: the identical request repeated with the same key returns the original Memory (&#x60;200&#x60;); the same key with a different payload is a &#x60;409&#x60; (&#x60;IDEMPOTENCY_KEY_REUSED&#x60;); if the original Memory was deleted meanwhile the answer is &#x60;404&#x60; (&#x60;MEMORY_CREATE_RESULT_DELETED&#x60;) and nothing is recreated.

### Example

```ts
import {
  Configuration,
  MemoriesApi,
} from '';
import type { CreateMemoryRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new MemoriesApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // MemoryCreate
    memoryCreate: ...,
    // string | Optional request identity (a UUID chosen by the client for one save). Repeating the same request with the same key returns the original result instead of creating it again; the key is scoped to the authenticated Account and Space and is retained for a bounded time. (optional)
    idempotencyKey: idempotencyKey_example,
  } satisfies CreateMemoryRequest;

  try {
    const data = await api.createMemory(body);
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
| **memoryCreate** | [MemoryCreate](MemoryCreate.md) |  | |
| **idempotencyKey** | `string` | Optional request identity (a UUID chosen by the client for one save). Repeating the same request with the same key returns the original result instead of creating it again; the key is scoped to the authenticated Account and Space and is retained for a bounded time. | [Optional] [Defaults to `undefined`] |

### Return type

[**MemoryDetail**](MemoryDetail.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | The request identity (&#x60;Idempotency-Key&#x60;) was already used for an equivalent request. The response returns the original Memory in its current state; no second Memory is created. |  * ETag - Resource version to use for the next If-Match write request. <br>  |
| **201** | Successful Response |  * ETag - Resource version to use for the next If-Match write request. <br>  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## deleteMemory

> deleteMemory(memoryId, spaceId, ifMatch)

Delete Memory

### Example

```ts
import {
  Configuration,
  MemoriesApi,
} from '';
import type { DeleteMemoryRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new MemoriesApi();

  const body = {
    // string
    memoryId: memoryId_example,
    // string
    spaceId: spaceId_example,
    // string | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
  } satisfies DeleteMemoryRequest;

  try {
    const data = await api.deleteMemory(body);
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
| **memoryId** | `string` |  | [Defaults to `undefined`] |
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
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getMemory

> MemoryDetail getMemory(memoryId, spaceId)

Get Memory

### Example

```ts
import {
  Configuration,
  MemoriesApi,
} from '';
import type { GetMemoryRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new MemoriesApi();

  const body = {
    // string
    memoryId: memoryId_example,
    // string
    spaceId: spaceId_example,
  } satisfies GetMemoryRequest;

  try {
    const data = await api.getMemory(body);
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
| **memoryId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**MemoryDetail**](MemoryDetail.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  * ETag - Resource version to use for the next If-Match write request. <br>  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## listMemories

> MemoryPage listMemories(spaceId, cursor, limit, year)

List Memories

### Example

```ts
import {
  Configuration,
  MemoriesApi,
} from '';
import type { ListMemoriesRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new MemoriesApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // string (optional)
    cursor: cursor_example,
    // number (optional)
    limit: 56,
    // number (optional)
    year: 56,
  } satisfies ListMemoriesRequest;

  try {
    const data = await api.listMemories(body);
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
| **cursor** | `string` |  | [Optional] [Defaults to `undefined`] |
| **limit** | `number` |  | [Optional] [Defaults to `50`] |
| **year** | `number` |  | [Optional] [Defaults to `undefined`] |

### Return type

[**MemoryPage**](MemoryPage.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **400** | The request is syntactically valid but cannot be processed in this form. |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## replaceMemoryAttachments

> MemoryDetail replaceMemoryAttachments(memoryId, spaceId, ifMatch, memoryAttachmentSet)

Replace Memory Attachments

Replace the attachment set and ordering in one operation.  This is a PUT rather than an add/remove sequence: the client submits the state it observed, while &#x60;&#x60;If-Match&#x60;&#x60; verifies that state is still current.

### Example

```ts
import {
  Configuration,
  MemoriesApi,
} from '';
import type { ReplaceMemoryAttachmentsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new MemoriesApi();

  const body = {
    // string
    memoryId: memoryId_example,
    // string
    spaceId: spaceId_example,
    // string | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
    // MemoryAttachmentSet
    memoryAttachmentSet: ...,
  } satisfies ReplaceMemoryAttachmentsRequest;

  try {
    const data = await api.replaceMemoryAttachments(body);
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
| **memoryId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **ifMatch** | `string` | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header. | [Defaults to `undefined`] |
| **memoryAttachmentSet** | [MemoryAttachmentSet](MemoryAttachmentSet.md) |  | |

### Return type

[**MemoryDetail**](MemoryDetail.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  * ETag - Resource version to use for the next If-Match write request. <br>  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## updateMemory

> MemoryDetail updateMemory(memoryId, spaceId, ifMatch, memoryUpdate)

Update Memory

### Example

```ts
import {
  Configuration,
  MemoriesApi,
} from '';
import type { UpdateMemoryRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new MemoriesApi();

  const body = {
    // string
    memoryId: memoryId_example,
    // string
    spaceId: spaceId_example,
    // string | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
    // MemoryUpdate
    memoryUpdate: ...,
  } satisfies UpdateMemoryRequest;

  try {
    const data = await api.updateMemory(body);
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
| **memoryId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **ifMatch** | `string` | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header. | [Defaults to `undefined`] |
| **memoryUpdate** | [MemoryUpdate](MemoryUpdate.md) |  | |

### Return type

[**MemoryDetail**](MemoryDetail.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  * ETag - Resource version to use for the next If-Match write request. <br>  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

