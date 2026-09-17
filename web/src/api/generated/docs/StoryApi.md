# StoryApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**getStoryDiscover**](StoryApi.md#getstorydiscover) | **GET** /api/v1/spaces/{spaceId}/discover | Get Story Discover |
| [**getStoryTimeline**](StoryApi.md#getstorytimeline) | **GET** /api/v1/spaces/{spaceId}/timeline | Get Story Timeline |
| [**recordStoryView**](StoryApi.md#recordstoryview) | **POST** /api/v1/spaces/{spaceId}/story-views | Record Story View |



## getStoryDiscover

> DiscoverSelection getStoryDiscover(spaceId)

Get Story Discover

Return today\&#39;s finite backend-owned curated Story selection.  Snapshot order is canonical. If the original lead becomes unreadable, the first surviving reference becomes the response lead and all later survivors remain in their existing order. Nothing is refilled or reshuffled during that local day.

### Example

```ts
import {
  Configuration,
  StoryApi,
} from '';
import type { GetStoryDiscoverRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new StoryApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies GetStoryDiscoverRequest;

  try {
    const data = await api.getStoryDiscover(body);
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

[**DiscoverSelection**](DiscoverSelection.md)

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


## getStoryTimeline

> StoryPage getStoryTimeline(spaceId, type, year, order, cursor, limit)

Get Story Timeline

Return the shared timeline of memories, milestones, and heart moments.  Private heart moments never appear here, including for their owner.

### Example

```ts
import {
  Configuration,
  StoryApi,
} from '';
import type { GetStoryTimelineRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new StoryApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // Array<StoryKind> (optional)
    type: ...,
    // number (optional)
    year: 56,
    // StoryOrder (optional)
    order: ...,
    // string (optional)
    cursor: cursor_example,
    // number (optional)
    limit: 56,
  } satisfies GetStoryTimelineRequest;

  try {
    const data = await api.getStoryTimeline(body);
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
| **type** | `Array<StoryKind>` |  | [Optional] |
| **year** | `number` |  | [Optional] [Defaults to `undefined`] |
| **order** | `StoryOrder` |  | [Optional] [Defaults to `undefined`] [Enum: ASC, DESC] |
| **cursor** | `string` |  | [Optional] [Defaults to `undefined`] |
| **limit** | `number` |  | [Optional] [Defaults to `50`] |

### Return type

[**StoryPage**](StoryPage.md)

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


## recordStoryView

> recordStoryView(spaceId, storyViewReceipt)

Record Story View

Record an intentional Story detail view without retaining an event history.

### Example

```ts
import {
  Configuration,
  StoryApi,
} from '';
import type { RecordStoryViewRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new StoryApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // StoryViewReceipt
    storyViewReceipt: ...,
  } satisfies RecordStoryViewRequest;

  try {
    const data = await api.recordStoryView(body);
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
| **storyViewReceipt** | [StoryViewReceipt](StoryViewReceipt.md) |  | |

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
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

