# MemoryPlanningRelationsApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**linkMemoryPlan**](MemoryPlanningRelationsApi.md#linkmemoryplan) | **PUT** /api/v1/spaces/{spaceId}/memories/{memoryId}/plans/{targetId} | Link |
| [**linkMemoryWish**](MemoryPlanningRelationsApi.md#linkmemorywish) | **PUT** /api/v1/spaces/{spaceId}/memories/{memoryId}/wishes/{targetId} | Link |
| [**listMemoryPlans**](MemoryPlanningRelationsApi.md#listmemoryplans) | **GET** /api/v1/spaces/{spaceId}/memories/{memoryId}/plans | List Targets |
| [**listMemoryWishes**](MemoryPlanningRelationsApi.md#listmemorywishes) | **GET** /api/v1/spaces/{spaceId}/memories/{memoryId}/wishes | List Targets |
| [**unlinkMemoryPlan**](MemoryPlanningRelationsApi.md#unlinkmemoryplan) | **DELETE** /api/v1/spaces/{spaceId}/memories/{memoryId}/plans/{targetId} | Unlink |
| [**unlinkMemoryWish**](MemoryPlanningRelationsApi.md#unlinkmemorywish) | **DELETE** /api/v1/spaces/{spaceId}/memories/{memoryId}/wishes/{targetId} | Unlink |



## linkMemoryPlan

> linkMemoryPlan(memoryId, targetId, spaceId)

Link

### Example

```ts
import {
  Configuration,
  MemoryPlanningRelationsApi,
} from '';
import type { LinkMemoryPlanRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new MemoryPlanningRelationsApi();

  const body = {
    // string
    memoryId: memoryId_example,
    // string
    targetId: targetId_example,
    // string
    spaceId: spaceId_example,
  } satisfies LinkMemoryPlanRequest;

  try {
    const data = await api.linkMemoryPlan(body);
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
| **targetId** | `string` |  | [Defaults to `undefined`] |
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


## linkMemoryWish

> linkMemoryWish(memoryId, targetId, spaceId)

Link

### Example

```ts
import {
  Configuration,
  MemoryPlanningRelationsApi,
} from '';
import type { LinkMemoryWishRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new MemoryPlanningRelationsApi();

  const body = {
    // string
    memoryId: memoryId_example,
    // string
    targetId: targetId_example,
    // string
    spaceId: spaceId_example,
  } satisfies LinkMemoryWishRequest;

  try {
    const data = await api.linkMemoryWish(body);
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
| **targetId** | `string` |  | [Defaults to `undefined`] |
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


## listMemoryPlans

> RelationTargets listMemoryPlans(memoryId, spaceId)

List Targets

### Example

```ts
import {
  Configuration,
  MemoryPlanningRelationsApi,
} from '';
import type { ListMemoryPlansRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new MemoryPlanningRelationsApi();

  const body = {
    // string
    memoryId: memoryId_example,
    // string
    spaceId: spaceId_example,
  } satisfies ListMemoryPlansRequest;

  try {
    const data = await api.listMemoryPlans(body);
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

[**RelationTargets**](RelationTargets.md)

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


## listMemoryWishes

> RelationTargets listMemoryWishes(memoryId, spaceId)

List Targets

### Example

```ts
import {
  Configuration,
  MemoryPlanningRelationsApi,
} from '';
import type { ListMemoryWishesRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new MemoryPlanningRelationsApi();

  const body = {
    // string
    memoryId: memoryId_example,
    // string
    spaceId: spaceId_example,
  } satisfies ListMemoryWishesRequest;

  try {
    const data = await api.listMemoryWishes(body);
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

[**RelationTargets**](RelationTargets.md)

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


## unlinkMemoryPlan

> unlinkMemoryPlan(memoryId, targetId, spaceId)

Unlink

### Example

```ts
import {
  Configuration,
  MemoryPlanningRelationsApi,
} from '';
import type { UnlinkMemoryPlanRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new MemoryPlanningRelationsApi();

  const body = {
    // string
    memoryId: memoryId_example,
    // string
    targetId: targetId_example,
    // string
    spaceId: spaceId_example,
  } satisfies UnlinkMemoryPlanRequest;

  try {
    const data = await api.unlinkMemoryPlan(body);
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
| **targetId** | `string` |  | [Defaults to `undefined`] |
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


## unlinkMemoryWish

> unlinkMemoryWish(memoryId, targetId, spaceId)

Unlink

### Example

```ts
import {
  Configuration,
  MemoryPlanningRelationsApi,
} from '';
import type { UnlinkMemoryWishRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new MemoryPlanningRelationsApi();

  const body = {
    // string
    memoryId: memoryId_example,
    // string
    targetId: targetId_example,
    // string
    spaceId: spaceId_example,
  } satisfies UnlinkMemoryWishRequest;

  try {
    const data = await api.unlinkMemoryWish(body);
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
| **targetId** | `string` |  | [Defaults to `undefined`] |
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

