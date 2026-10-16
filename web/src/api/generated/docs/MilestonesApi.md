# MilestonesApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**createMilestone**](MilestonesApi.md#createmilestone) | **POST** /api/v1/spaces/{spaceId}/milestones | Create Milestone |
| [**deleteMilestone**](MilestonesApi.md#deletemilestone) | **DELETE** /api/v1/spaces/{spaceId}/milestones/{milestoneId} | Delete Milestone |
| [**getMilestone**](MilestonesApi.md#getmilestone) | **GET** /api/v1/spaces/{spaceId}/milestones/{milestoneId} | Get Milestone |
| [**listMilestones**](MilestonesApi.md#listmilestones) | **GET** /api/v1/spaces/{spaceId}/milestones | List Milestones |
| [**updateMilestone**](MilestonesApi.md#updatemilestone) | **PATCH** /api/v1/spaces/{spaceId}/milestones/{milestoneId} | Update Milestone |



## createMilestone

> MilestoneDetail createMilestone(spaceId, milestoneCreate, idempotencyKey)

Create Milestone

### Example

```ts
import {
  Configuration,
  MilestonesApi,
} from '';
import type { CreateMilestoneRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new MilestonesApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // MilestoneCreate
    milestoneCreate: ...,
    // string | Optional request identity (a UUID chosen by the client for one save). Repeating the same request with the same key returns the original result instead of creating it again; the key is scoped to the authenticated Account and Space and is retained for a bounded time. (optional)
    idempotencyKey: idempotencyKey_example,
  } satisfies CreateMilestoneRequest;

  try {
    const data = await api.createMilestone(body);
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
| **milestoneCreate** | [MilestoneCreate](MilestoneCreate.md) |  | |
| **idempotencyKey** | `string` | Optional request identity (a UUID chosen by the client for one save). Repeating the same request with the same key returns the original result instead of creating it again; the key is scoped to the authenticated Account and Space and is retained for a bounded time. | [Optional] [Defaults to `undefined`] |

### Return type

[**MilestoneDetail**](MilestoneDetail.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | The request identity (&#x60;Idempotency-Key&#x60;) was already used for an equivalent request. The response returns the original Milestone in its current state; no second Milestone is created. |  * ETag - Resource version to use for the next If-Match write request. <br>  |
| **201** | Successful Response |  * ETag - Resource version to use for the next If-Match write request. <br>  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## deleteMilestone

> deleteMilestone(milestoneId, spaceId, ifMatch)

Delete Milestone

### Example

```ts
import {
  Configuration,
  MilestonesApi,
} from '';
import type { DeleteMilestoneRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new MilestonesApi();

  const body = {
    // string
    milestoneId: milestoneId_example,
    // string
    spaceId: spaceId_example,
    // string | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
  } satisfies DeleteMilestoneRequest;

  try {
    const data = await api.deleteMilestone(body);
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


## getMilestone

> MilestoneDetail getMilestone(milestoneId, spaceId)

Get Milestone

### Example

```ts
import {
  Configuration,
  MilestonesApi,
} from '';
import type { GetMilestoneRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new MilestonesApi();

  const body = {
    // string
    milestoneId: milestoneId_example,
    // string
    spaceId: spaceId_example,
  } satisfies GetMilestoneRequest;

  try {
    const data = await api.getMilestone(body);
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

[**MilestoneDetail**](MilestoneDetail.md)

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


## listMilestones

> MilestonePage listMilestones(spaceId, cursor, limit, year)

List Milestones

### Example

```ts
import {
  Configuration,
  MilestonesApi,
} from '';
import type { ListMilestonesRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new MilestonesApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // string (optional)
    cursor: cursor_example,
    // number (optional)
    limit: 56,
    // number (optional)
    year: 56,
  } satisfies ListMilestonesRequest;

  try {
    const data = await api.listMilestones(body);
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

[**MilestonePage**](MilestonePage.md)

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


## updateMilestone

> MilestoneDetail updateMilestone(milestoneId, spaceId, ifMatch, milestoneUpdate)

Update Milestone

### Example

```ts
import {
  Configuration,
  MilestonesApi,
} from '';
import type { UpdateMilestoneRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new MilestonesApi();

  const body = {
    // string
    milestoneId: milestoneId_example,
    // string
    spaceId: spaceId_example,
    // string | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
    // MilestoneUpdate
    milestoneUpdate: ...,
  } satisfies UpdateMilestoneRequest;

  try {
    const data = await api.updateMilestone(body);
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
| **ifMatch** | `string` | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header. | [Defaults to `undefined`] |
| **milestoneUpdate** | [MilestoneUpdate](MilestoneUpdate.md) |  | |

### Return type

[**MilestoneDetail**](MilestoneDetail.md)

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

