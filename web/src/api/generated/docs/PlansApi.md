# PlansApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**completePlan**](PlansApi.md#completeplan) | **POST** /api/v1/spaces/{spaceId}/plans/{planId}/complete | Complete Plan |
| [**convertWishToPlan**](PlansApi.md#convertwishtoplan) | **POST** /api/v1/spaces/{spaceId}/wishes/{wishId}/plan | Convert Wish To Plan |
| [**createPlan**](PlansApi.md#createplan) | **POST** /api/v1/spaces/{spaceId}/plans | Create Plan |
| [**deletePlan**](PlansApi.md#deleteplan) | **DELETE** /api/v1/spaces/{spaceId}/plans/{planId} | Delete Plan |
| [**getPlan**](PlansApi.md#getplan) | **GET** /api/v1/spaces/{spaceId}/plans/{planId} | Get Plan |
| [**listPlans**](PlansApi.md#listplans) | **GET** /api/v1/spaces/{spaceId}/plans | List Plans |
| [**returnPlanToWish**](PlansApi.md#returnplantowish) | **POST** /api/v1/spaces/{spaceId}/plans/{planId}/return-to-wish | Return Plan To Wish |
| [**schedulePlan**](PlansApi.md#scheduleplan) | **POST** /api/v1/spaces/{spaceId}/plans/{planId}/schedule | Schedule Plan |
| [**unschedulePlan**](PlansApi.md#unscheduleplan) | **POST** /api/v1/spaces/{spaceId}/plans/{planId}/unschedule | Unschedule Plan |
| [**updatePlan**](PlansApi.md#updateplan) | **PATCH** /api/v1/spaces/{spaceId}/plans/{planId} | Update Plan |



## completePlan

> PlanDetail completePlan(planId, spaceId, ifMatch, planComplete)

Complete Plan

### Example

```ts
import {
  Configuration,
  PlansApi,
} from '';
import type { CompletePlanRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PlansApi();

  const body = {
    // string
    planId: planId_example,
    // string
    spaceId: spaceId_example,
    // string | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
    // PlanComplete
    planComplete: ...,
  } satisfies CompletePlanRequest;

  try {
    const data = await api.completePlan(body);
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
| **planId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **ifMatch** | `string` | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header. | [Defaults to `undefined`] |
| **planComplete** | [PlanComplete](PlanComplete.md) |  | |

### Return type

[**PlanDetail**](PlanDetail.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  * ETag - Resource version to use for the next If-Match write request. <br>  * X-Eimir-Shared-Achievement - Present only when the server confirms an enabled Shared Achievement for the successful domain completion. <br>  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## convertWishToPlan

> WishToPlanResponse convertWishToPlan(wishId, spaceId, ifMatch, wishToPlan)

Convert Wish To Plan

### Example

```ts
import {
  Configuration,
  PlansApi,
} from '';
import type { ConvertWishToPlanRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PlansApi();

  const body = {
    // string
    wishId: wishId_example,
    // string
    spaceId: spaceId_example,
    // string | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
    // WishToPlan
    wishToPlan: ...,
  } satisfies ConvertWishToPlanRequest;

  try {
    const data = await api.convertWishToPlan(body);
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
| **wishId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **ifMatch** | `string` | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header. | [Defaults to `undefined`] |
| **wishToPlan** | [WishToPlan](WishToPlan.md) |  | |

### Return type

[**WishToPlanResponse**](WishToPlanResponse.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | The wish was already converted. The response returns the same original plan; no second plan is created. |  * ETag - Resource version to use for the next If-Match write request. <br>  |
| **201** | Successful Response |  * ETag - Resource version to use for the next If-Match write request. <br>  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## createPlan

> PlanDetail createPlan(spaceId, planCreate)

Create Plan

### Example

```ts
import {
  Configuration,
  PlansApi,
} from '';
import type { CreatePlanRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PlansApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // PlanCreate
    planCreate: ...,
  } satisfies CreatePlanRequest;

  try {
    const data = await api.createPlan(body);
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
| **planCreate** | [PlanCreate](PlanCreate.md) |  | |

### Return type

[**PlanDetail**](PlanDetail.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **201** | Successful Response |  * ETag - Resource version to use for the next If-Match write request. <br>  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## deletePlan

> deletePlan(planId, spaceId, ifMatch)

Delete Plan

### Example

```ts
import {
  Configuration,
  PlansApi,
} from '';
import type { DeletePlanRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PlansApi();

  const body = {
    // string
    planId: planId_example,
    // string
    spaceId: spaceId_example,
    // string | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
  } satisfies DeletePlanRequest;

  try {
    const data = await api.deletePlan(body);
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
| **planId** | `string` |  | [Defaults to `undefined`] |
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
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getPlan

> PlanDetail getPlan(planId, spaceId)

Get Plan

### Example

```ts
import {
  Configuration,
  PlansApi,
} from '';
import type { GetPlanRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PlansApi();

  const body = {
    // string
    planId: planId_example,
    // string
    spaceId: spaceId_example,
  } satisfies GetPlanRequest;

  try {
    const data = await api.getPlan(body);
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
| **planId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**PlanDetail**](PlanDetail.md)

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


## listPlans

> PlanPage listPlans(spaceId, cursor, limit, status)

List Plans

### Example

```ts
import {
  Configuration,
  PlansApi,
} from '';
import type { ListPlansRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PlansApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // string (optional)
    cursor: cursor_example,
    // number (optional)
    limit: 56,
    // PlanStatus (optional)
    status: ...,
  } satisfies ListPlansRequest;

  try {
    const data = await api.listPlans(body);
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
| **status** | `PlanStatus` |  | [Optional] [Defaults to `undefined`] [Enum: IDEA, PLANNED, COMPLETED] |

### Return type

[**PlanPage**](PlanPage.md)

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


## returnPlanToWish

> PlanReturnToWishResponse returnPlanToWish(planId, spaceId, ifMatch)

Return Plan To Wish

### Example

```ts
import {
  Configuration,
  PlansApi,
} from '';
import type { ReturnPlanToWishRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PlansApi();

  const body = {
    // string
    planId: planId_example,
    // string
    spaceId: spaceId_example,
    // string | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
  } satisfies ReturnPlanToWishRequest;

  try {
    const data = await api.returnPlanToWish(body);
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
| **planId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **ifMatch** | `string` | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header. | [Defaults to `undefined`] |

### Return type

[**PlanReturnToWishResponse**](PlanReturnToWishResponse.md)

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
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## schedulePlan

> PlanDetail schedulePlan(planId, spaceId, ifMatch, planSchedule)

Schedule Plan

### Example

```ts
import {
  Configuration,
  PlansApi,
} from '';
import type { SchedulePlanRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PlansApi();

  const body = {
    // string
    planId: planId_example,
    // string
    spaceId: spaceId_example,
    // string | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
    // PlanSchedule
    planSchedule: ...,
  } satisfies SchedulePlanRequest;

  try {
    const data = await api.schedulePlan(body);
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
| **planId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **ifMatch** | `string` | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header. | [Defaults to `undefined`] |
| **planSchedule** | [PlanSchedule](PlanSchedule.md) |  | |

### Return type

[**PlanDetail**](PlanDetail.md)

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
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## unschedulePlan

> PlanDetail unschedulePlan(planId, spaceId, ifMatch)

Unschedule Plan

### Example

```ts
import {
  Configuration,
  PlansApi,
} from '';
import type { UnschedulePlanRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PlansApi();

  const body = {
    // string
    planId: planId_example,
    // string
    spaceId: spaceId_example,
    // string | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
  } satisfies UnschedulePlanRequest;

  try {
    const data = await api.unschedulePlan(body);
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
| **planId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **ifMatch** | `string` | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header. | [Defaults to `undefined`] |

### Return type

[**PlanDetail**](PlanDetail.md)

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
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## updatePlan

> PlanDetail updatePlan(planId, spaceId, ifMatch, planUpdate)

Update Plan

### Example

```ts
import {
  Configuration,
  PlansApi,
} from '';
import type { UpdatePlanRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PlansApi();

  const body = {
    // string
    planId: planId_example,
    // string
    spaceId: spaceId_example,
    // string | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
    // PlanUpdate
    planUpdate: ...,
  } satisfies UpdatePlanRequest;

  try {
    const data = await api.updatePlan(body);
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
| **planId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **ifMatch** | `string` | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header. | [Defaults to `undefined`] |
| **planUpdate** | [PlanUpdate](PlanUpdate.md) |  | |

### Return type

[**PlanDetail**](PlanDetail.md)

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
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

