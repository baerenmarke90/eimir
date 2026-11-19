# StoryPlanningRelationsApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**linkHeartMomentPlan**](StoryPlanningRelationsApi.md#linkheartmomentplan) | **PUT** /api/v1/spaces/{spaceId}/heart-moments/{heartMomentId}/plans/{targetId} | Link |
| [**linkMilestonePlan**](StoryPlanningRelationsApi.md#linkmilestoneplan) | **PUT** /api/v1/spaces/{spaceId}/milestones/{milestoneId}/plans/{targetId} | Link |
| [**listHeartMomentPlans**](StoryPlanningRelationsApi.md#listheartmomentplans) | **GET** /api/v1/spaces/{spaceId}/heart-moments/{heartMomentId}/plans | List Targets |
| [**listMilestonePlans**](StoryPlanningRelationsApi.md#listmilestoneplans) | **GET** /api/v1/spaces/{spaceId}/milestones/{milestoneId}/plans | List Targets |
| [**unlinkHeartMomentPlan**](StoryPlanningRelationsApi.md#unlinkheartmomentplan) | **DELETE** /api/v1/spaces/{spaceId}/heart-moments/{heartMomentId}/plans/{targetId} | Unlink |
| [**unlinkMilestonePlan**](StoryPlanningRelationsApi.md#unlinkmilestoneplan) | **DELETE** /api/v1/spaces/{spaceId}/milestones/{milestoneId}/plans/{targetId} | Unlink |



## linkHeartMomentPlan

> linkHeartMomentPlan(heartMomentId, targetId, spaceId)

Link

### Example

```ts
import {
  Configuration,
  StoryPlanningRelationsApi,
} from '';
import type { LinkHeartMomentPlanRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new StoryPlanningRelationsApi();

  const body = {
    // string
    heartMomentId: heartMomentId_example,
    // string
    targetId: targetId_example,
    // string
    spaceId: spaceId_example,
  } satisfies LinkHeartMomentPlanRequest;

  try {
    const data = await api.linkHeartMomentPlan(body);
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
| **heartMomentId** | `string` |  | [Defaults to `undefined`] |
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


## linkMilestonePlan

> linkMilestonePlan(milestoneId, targetId, spaceId)

Link

### Example

```ts
import {
  Configuration,
  StoryPlanningRelationsApi,
} from '';
import type { LinkMilestonePlanRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new StoryPlanningRelationsApi();

  const body = {
    // string
    milestoneId: milestoneId_example,
    // string
    targetId: targetId_example,
    // string
    spaceId: spaceId_example,
  } satisfies LinkMilestonePlanRequest;

  try {
    const data = await api.linkMilestonePlan(body);
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
| **milestoneId** | `string` |  | [Defaults to `undefined`] |
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


## listHeartMomentPlans

> RelationTargets listHeartMomentPlans(heartMomentId, spaceId)

List Targets

### Example

```ts
import {
  Configuration,
  StoryPlanningRelationsApi,
} from '';
import type { ListHeartMomentPlansRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new StoryPlanningRelationsApi();

  const body = {
    // string
    heartMomentId: heartMomentId_example,
    // string
    spaceId: spaceId_example,
  } satisfies ListHeartMomentPlansRequest;

  try {
    const data = await api.listHeartMomentPlans(body);
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
| **heartMomentId** | `string` |  | [Defaults to `undefined`] |
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


## listMilestonePlans

> RelationTargets listMilestonePlans(milestoneId, spaceId)

List Targets

### Example

```ts
import {
  Configuration,
  StoryPlanningRelationsApi,
} from '';
import type { ListMilestonePlansRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new StoryPlanningRelationsApi();

  const body = {
    // string
    milestoneId: milestoneId_example,
    // string
    spaceId: spaceId_example,
  } satisfies ListMilestonePlansRequest;

  try {
    const data = await api.listMilestonePlans(body);
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
| **milestoneId** | `string` |  | [Defaults to `undefined`] |
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


## unlinkHeartMomentPlan

> unlinkHeartMomentPlan(heartMomentId, targetId, spaceId)

Unlink

### Example

```ts
import {
  Configuration,
  StoryPlanningRelationsApi,
} from '';
import type { UnlinkHeartMomentPlanRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new StoryPlanningRelationsApi();

  const body = {
    // string
    heartMomentId: heartMomentId_example,
    // string
    targetId: targetId_example,
    // string
    spaceId: spaceId_example,
  } satisfies UnlinkHeartMomentPlanRequest;

  try {
    const data = await api.unlinkHeartMomentPlan(body);
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
| **heartMomentId** | `string` |  | [Defaults to `undefined`] |
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


## unlinkMilestonePlan

> unlinkMilestonePlan(milestoneId, targetId, spaceId)

Unlink

### Example

```ts
import {
  Configuration,
  StoryPlanningRelationsApi,
} from '';
import type { UnlinkMilestonePlanRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new StoryPlanningRelationsApi();

  const body = {
    // string
    milestoneId: milestoneId_example,
    // string
    targetId: targetId_example,
    // string
    spaceId: spaceId_example,
  } satisfies UnlinkMilestonePlanRequest;

  try {
    const data = await api.unlinkMilestonePlan(body);
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
| **milestoneId** | `string` |  | [Defaults to `undefined`] |
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

