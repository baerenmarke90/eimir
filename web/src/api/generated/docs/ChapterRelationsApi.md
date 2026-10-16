# ChapterRelationsApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**linkChapterHeartMoment**](ChapterRelationsApi.md#linkchapterheartmoment) | **PUT** /api/v1/spaces/{spaceId}/chapters/{chapterId}/heart-moments/{targetId} | Link Chapter Heart-Moments |
| [**linkChapterMemory**](ChapterRelationsApi.md#linkchaptermemory) | **PUT** /api/v1/spaces/{spaceId}/chapters/{chapterId}/memories/{targetId} | Link Chapter Memories |
| [**linkChapterMilestone**](ChapterRelationsApi.md#linkchaptermilestone) | **PUT** /api/v1/spaces/{spaceId}/chapters/{chapterId}/milestones/{targetId} | Link Chapter Milestones |
| [**listChapterContent**](ChapterRelationsApi.md#listchaptercontent) | **GET** /api/v1/spaces/{spaceId}/chapters/{chapterId}/content | List Chapter Content |
| [**listChapterHeartMoments**](ChapterRelationsApi.md#listchapterheartmoments) | **GET** /api/v1/spaces/{spaceId}/chapters/{chapterId}/heart-moments | List Chapter Heart-Moments |
| [**listChapterMemories**](ChapterRelationsApi.md#listchaptermemories) | **GET** /api/v1/spaces/{spaceId}/chapters/{chapterId}/memories | List Chapter Memories |
| [**listChapterMilestones**](ChapterRelationsApi.md#listchaptermilestones) | **GET** /api/v1/spaces/{spaceId}/chapters/{chapterId}/milestones | List Chapter Milestones |
| [**unlinkChapterHeartMoment**](ChapterRelationsApi.md#unlinkchapterheartmoment) | **DELETE** /api/v1/spaces/{spaceId}/chapters/{chapterId}/heart-moments/{targetId} | Unlink Chapter Heart-Moments |
| [**unlinkChapterMemory**](ChapterRelationsApi.md#unlinkchaptermemory) | **DELETE** /api/v1/spaces/{spaceId}/chapters/{chapterId}/memories/{targetId} | Unlink Chapter Memories |
| [**unlinkChapterMilestone**](ChapterRelationsApi.md#unlinkchaptermilestone) | **DELETE** /api/v1/spaces/{spaceId}/chapters/{chapterId}/milestones/{targetId} | Unlink Chapter Milestones |



## linkChapterHeartMoment

> linkChapterHeartMoment(chapterId, targetId, spaceId)

Link Chapter Heart-Moments

### Example

```ts
import {
  Configuration,
  ChapterRelationsApi,
} from '';
import type { LinkChapterHeartMomentRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ChapterRelationsApi();

  const body = {
    // string
    chapterId: chapterId_example,
    // string
    targetId: targetId_example,
    // string
    spaceId: spaceId_example,
  } satisfies LinkChapterHeartMomentRequest;

  try {
    const data = await api.linkChapterHeartMoment(body);
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
| **chapterId** | `string` |  | [Defaults to `undefined`] |
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


## linkChapterMemory

> linkChapterMemory(chapterId, targetId, spaceId)

Link Chapter Memories

### Example

```ts
import {
  Configuration,
  ChapterRelationsApi,
} from '';
import type { LinkChapterMemoryRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ChapterRelationsApi();

  const body = {
    // string
    chapterId: chapterId_example,
    // string
    targetId: targetId_example,
    // string
    spaceId: spaceId_example,
  } satisfies LinkChapterMemoryRequest;

  try {
    const data = await api.linkChapterMemory(body);
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
| **chapterId** | `string` |  | [Defaults to `undefined`] |
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


## linkChapterMilestone

> linkChapterMilestone(chapterId, targetId, spaceId)

Link Chapter Milestones

### Example

```ts
import {
  Configuration,
  ChapterRelationsApi,
} from '';
import type { LinkChapterMilestoneRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ChapterRelationsApi();

  const body = {
    // string
    chapterId: chapterId_example,
    // string
    targetId: targetId_example,
    // string
    spaceId: spaceId_example,
  } satisfies LinkChapterMilestoneRequest;

  try {
    const data = await api.linkChapterMilestone(body);
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
| **chapterId** | `string` |  | [Defaults to `undefined`] |
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


## listChapterContent

> ChapterContent listChapterContent(chapterId, spaceId)

List Chapter Content

### Example

```ts
import {
  Configuration,
  ChapterRelationsApi,
} from '';
import type { ListChapterContentRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ChapterRelationsApi();

  const body = {
    // string
    chapterId: chapterId_example,
    // string
    spaceId: spaceId_example,
  } satisfies ListChapterContentRequest;

  try {
    const data = await api.listChapterContent(body);
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
| **chapterId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**ChapterContent**](ChapterContent.md)

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


## listChapterHeartMoments

> ChapterRelationTargets listChapterHeartMoments(chapterId, spaceId)

List Chapter Heart-Moments

### Example

```ts
import {
  Configuration,
  ChapterRelationsApi,
} from '';
import type { ListChapterHeartMomentsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ChapterRelationsApi();

  const body = {
    // string
    chapterId: chapterId_example,
    // string
    spaceId: spaceId_example,
  } satisfies ListChapterHeartMomentsRequest;

  try {
    const data = await api.listChapterHeartMoments(body);
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
| **chapterId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**ChapterRelationTargets**](ChapterRelationTargets.md)

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


## listChapterMemories

> ChapterRelationTargets listChapterMemories(chapterId, spaceId)

List Chapter Memories

### Example

```ts
import {
  Configuration,
  ChapterRelationsApi,
} from '';
import type { ListChapterMemoriesRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ChapterRelationsApi();

  const body = {
    // string
    chapterId: chapterId_example,
    // string
    spaceId: spaceId_example,
  } satisfies ListChapterMemoriesRequest;

  try {
    const data = await api.listChapterMemories(body);
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
| **chapterId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**ChapterRelationTargets**](ChapterRelationTargets.md)

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


## listChapterMilestones

> ChapterRelationTargets listChapterMilestones(chapterId, spaceId)

List Chapter Milestones

### Example

```ts
import {
  Configuration,
  ChapterRelationsApi,
} from '';
import type { ListChapterMilestonesRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ChapterRelationsApi();

  const body = {
    // string
    chapterId: chapterId_example,
    // string
    spaceId: spaceId_example,
  } satisfies ListChapterMilestonesRequest;

  try {
    const data = await api.listChapterMilestones(body);
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
| **chapterId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**ChapterRelationTargets**](ChapterRelationTargets.md)

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


## unlinkChapterHeartMoment

> unlinkChapterHeartMoment(chapterId, targetId, spaceId)

Unlink Chapter Heart-Moments

### Example

```ts
import {
  Configuration,
  ChapterRelationsApi,
} from '';
import type { UnlinkChapterHeartMomentRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ChapterRelationsApi();

  const body = {
    // string
    chapterId: chapterId_example,
    // string
    targetId: targetId_example,
    // string
    spaceId: spaceId_example,
  } satisfies UnlinkChapterHeartMomentRequest;

  try {
    const data = await api.unlinkChapterHeartMoment(body);
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
| **chapterId** | `string` |  | [Defaults to `undefined`] |
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


## unlinkChapterMemory

> unlinkChapterMemory(chapterId, targetId, spaceId)

Unlink Chapter Memories

### Example

```ts
import {
  Configuration,
  ChapterRelationsApi,
} from '';
import type { UnlinkChapterMemoryRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ChapterRelationsApi();

  const body = {
    // string
    chapterId: chapterId_example,
    // string
    targetId: targetId_example,
    // string
    spaceId: spaceId_example,
  } satisfies UnlinkChapterMemoryRequest;

  try {
    const data = await api.unlinkChapterMemory(body);
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
| **chapterId** | `string` |  | [Defaults to `undefined`] |
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


## unlinkChapterMilestone

> unlinkChapterMilestone(chapterId, targetId, spaceId)

Unlink Chapter Milestones

### Example

```ts
import {
  Configuration,
  ChapterRelationsApi,
} from '';
import type { UnlinkChapterMilestoneRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ChapterRelationsApi();

  const body = {
    // string
    chapterId: chapterId_example,
    // string
    targetId: targetId_example,
    // string
    spaceId: spaceId_example,
  } satisfies UnlinkChapterMilestoneRequest;

  try {
    const data = await api.unlinkChapterMilestone(body);
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
| **chapterId** | `string` |  | [Defaults to `undefined`] |
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

