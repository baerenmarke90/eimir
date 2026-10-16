# PlaceRelationsApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**linkPlaceHeartMoment**](PlaceRelationsApi.md#linkplaceheartmoment) | **PUT** /api/v1/spaces/{spaceId}/places/{placeId}/heart-moments/{targetId} | Link Place Heart-Moments |
| [**linkPlaceMemory**](PlaceRelationsApi.md#linkplacememory) | **PUT** /api/v1/spaces/{spaceId}/places/{placeId}/memories/{targetId} | Link Place Memories |
| [**linkPlaceMilestone**](PlaceRelationsApi.md#linkplacemilestone) | **PUT** /api/v1/spaces/{spaceId}/places/{placeId}/milestones/{targetId} | Link Place Milestones |
| [**listPlaceHeartMoments**](PlaceRelationsApi.md#listplaceheartmoments) | **GET** /api/v1/spaces/{spaceId}/places/{placeId}/heart-moments | List Place Heart-Moments |
| [**listPlaceMemories**](PlaceRelationsApi.md#listplacememories) | **GET** /api/v1/spaces/{spaceId}/places/{placeId}/memories | List Place Memories |
| [**listPlaceMilestones**](PlaceRelationsApi.md#listplacemilestones) | **GET** /api/v1/spaces/{spaceId}/places/{placeId}/milestones | List Place Milestones |
| [**unlinkPlaceHeartMoment**](PlaceRelationsApi.md#unlinkplaceheartmoment) | **DELETE** /api/v1/spaces/{spaceId}/places/{placeId}/heart-moments/{targetId} | Unlink Place Heart-Moments |
| [**unlinkPlaceMemory**](PlaceRelationsApi.md#unlinkplacememory) | **DELETE** /api/v1/spaces/{spaceId}/places/{placeId}/memories/{targetId} | Unlink Place Memories |
| [**unlinkPlaceMilestone**](PlaceRelationsApi.md#unlinkplacemilestone) | **DELETE** /api/v1/spaces/{spaceId}/places/{placeId}/milestones/{targetId} | Unlink Place Milestones |



## linkPlaceHeartMoment

> linkPlaceHeartMoment(placeId, targetId, spaceId)

Link Place Heart-Moments

### Example

```ts
import {
  Configuration,
  PlaceRelationsApi,
} from '';
import type { LinkPlaceHeartMomentRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PlaceRelationsApi();

  const body = {
    // string
    placeId: placeId_example,
    // string
    targetId: targetId_example,
    // string
    spaceId: spaceId_example,
  } satisfies LinkPlaceHeartMomentRequest;

  try {
    const data = await api.linkPlaceHeartMoment(body);
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
| **placeId** | `string` |  | [Defaults to `undefined`] |
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


## linkPlaceMemory

> linkPlaceMemory(placeId, targetId, spaceId)

Link Place Memories

### Example

```ts
import {
  Configuration,
  PlaceRelationsApi,
} from '';
import type { LinkPlaceMemoryRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PlaceRelationsApi();

  const body = {
    // string
    placeId: placeId_example,
    // string
    targetId: targetId_example,
    // string
    spaceId: spaceId_example,
  } satisfies LinkPlaceMemoryRequest;

  try {
    const data = await api.linkPlaceMemory(body);
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
| **placeId** | `string` |  | [Defaults to `undefined`] |
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


## linkPlaceMilestone

> linkPlaceMilestone(placeId, targetId, spaceId)

Link Place Milestones

### Example

```ts
import {
  Configuration,
  PlaceRelationsApi,
} from '';
import type { LinkPlaceMilestoneRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PlaceRelationsApi();

  const body = {
    // string
    placeId: placeId_example,
    // string
    targetId: targetId_example,
    // string
    spaceId: spaceId_example,
  } satisfies LinkPlaceMilestoneRequest;

  try {
    const data = await api.linkPlaceMilestone(body);
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
| **placeId** | `string` |  | [Defaults to `undefined`] |
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


## listPlaceHeartMoments

> RelationTargets listPlaceHeartMoments(placeId, spaceId)

List Place Heart-Moments

### Example

```ts
import {
  Configuration,
  PlaceRelationsApi,
} from '';
import type { ListPlaceHeartMomentsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PlaceRelationsApi();

  const body = {
    // string
    placeId: placeId_example,
    // string
    spaceId: spaceId_example,
  } satisfies ListPlaceHeartMomentsRequest;

  try {
    const data = await api.listPlaceHeartMoments(body);
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
| **placeId** | `string` |  | [Defaults to `undefined`] |
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


## listPlaceMemories

> RelationTargets listPlaceMemories(placeId, spaceId)

List Place Memories

### Example

```ts
import {
  Configuration,
  PlaceRelationsApi,
} from '';
import type { ListPlaceMemoriesRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PlaceRelationsApi();

  const body = {
    // string
    placeId: placeId_example,
    // string
    spaceId: spaceId_example,
  } satisfies ListPlaceMemoriesRequest;

  try {
    const data = await api.listPlaceMemories(body);
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
| **placeId** | `string` |  | [Defaults to `undefined`] |
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


## listPlaceMilestones

> RelationTargets listPlaceMilestones(placeId, spaceId)

List Place Milestones

### Example

```ts
import {
  Configuration,
  PlaceRelationsApi,
} from '';
import type { ListPlaceMilestonesRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PlaceRelationsApi();

  const body = {
    // string
    placeId: placeId_example,
    // string
    spaceId: spaceId_example,
  } satisfies ListPlaceMilestonesRequest;

  try {
    const data = await api.listPlaceMilestones(body);
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
| **placeId** | `string` |  | [Defaults to `undefined`] |
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


## unlinkPlaceHeartMoment

> unlinkPlaceHeartMoment(placeId, targetId, spaceId)

Unlink Place Heart-Moments

### Example

```ts
import {
  Configuration,
  PlaceRelationsApi,
} from '';
import type { UnlinkPlaceHeartMomentRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PlaceRelationsApi();

  const body = {
    // string
    placeId: placeId_example,
    // string
    targetId: targetId_example,
    // string
    spaceId: spaceId_example,
  } satisfies UnlinkPlaceHeartMomentRequest;

  try {
    const data = await api.unlinkPlaceHeartMoment(body);
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
| **placeId** | `string` |  | [Defaults to `undefined`] |
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


## unlinkPlaceMemory

> unlinkPlaceMemory(placeId, targetId, spaceId)

Unlink Place Memories

### Example

```ts
import {
  Configuration,
  PlaceRelationsApi,
} from '';
import type { UnlinkPlaceMemoryRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PlaceRelationsApi();

  const body = {
    // string
    placeId: placeId_example,
    // string
    targetId: targetId_example,
    // string
    spaceId: spaceId_example,
  } satisfies UnlinkPlaceMemoryRequest;

  try {
    const data = await api.unlinkPlaceMemory(body);
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
| **placeId** | `string` |  | [Defaults to `undefined`] |
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


## unlinkPlaceMilestone

> unlinkPlaceMilestone(placeId, targetId, spaceId)

Unlink Place Milestones

### Example

```ts
import {
  Configuration,
  PlaceRelationsApi,
} from '';
import type { UnlinkPlaceMilestoneRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PlaceRelationsApi();

  const body = {
    // string
    placeId: placeId_example,
    // string
    targetId: targetId_example,
    // string
    spaceId: spaceId_example,
  } satisfies UnlinkPlaceMilestoneRequest;

  try {
    const data = await api.unlinkPlaceMilestone(body);
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
| **placeId** | `string` |  | [Defaults to `undefined`] |
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

