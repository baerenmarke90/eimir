# ChaptersApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**createChapter**](ChaptersApi.md#createchapter) | **POST** /api/v1/spaces/{spaceId}/chapters | Create Chapter |
| [**deleteChapter**](ChaptersApi.md#deletechapter) | **DELETE** /api/v1/spaces/{spaceId}/chapters/{chapterId} | Delete Chapter |
| [**getChapter**](ChaptersApi.md#getchapter) | **GET** /api/v1/spaces/{spaceId}/chapters/{chapterId} | Get Chapter |
| [**listChapters**](ChaptersApi.md#listchapters) | **GET** /api/v1/spaces/{spaceId}/chapters | List Chapters |
| [**updateChapter**](ChaptersApi.md#updatechapter) | **PATCH** /api/v1/spaces/{spaceId}/chapters/{chapterId} | Update Chapter |



## createChapter

> ChapterDetail createChapter(spaceId, chapterCreate)

Create Chapter

### Example

```ts
import {
  Configuration,
  ChaptersApi,
} from '';
import type { CreateChapterRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ChaptersApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // ChapterCreate
    chapterCreate: ...,
  } satisfies CreateChapterRequest;

  try {
    const data = await api.createChapter(body);
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
| **chapterCreate** | [ChapterCreate](ChapterCreate.md) |  | |

### Return type

[**ChapterDetail**](ChapterDetail.md)

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


## deleteChapter

> deleteChapter(chapterId, spaceId, ifMatch)

Delete Chapter

### Example

```ts
import {
  Configuration,
  ChaptersApi,
} from '';
import type { DeleteChapterRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ChaptersApi();

  const body = {
    // string
    chapterId: chapterId_example,
    // string
    spaceId: spaceId_example,
    // string | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
  } satisfies DeleteChapterRequest;

  try {
    const data = await api.deleteChapter(body);
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


## getChapter

> ChapterDetail getChapter(chapterId, spaceId)

Get Chapter

### Example

```ts
import {
  Configuration,
  ChaptersApi,
} from '';
import type { GetChapterRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ChaptersApi();

  const body = {
    // string
    chapterId: chapterId_example,
    // string
    spaceId: spaceId_example,
  } satisfies GetChapterRequest;

  try {
    const data = await api.getChapter(body);
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

[**ChapterDetail**](ChapterDetail.md)

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


## listChapters

> ChapterPage listChapters(spaceId, cursor, limit)

List Chapters

### Example

```ts
import {
  Configuration,
  ChaptersApi,
} from '';
import type { ListChaptersRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ChaptersApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // string (optional)
    cursor: cursor_example,
    // number (optional)
    limit: 56,
  } satisfies ListChaptersRequest;

  try {
    const data = await api.listChapters(body);
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

### Return type

[**ChapterPage**](ChapterPage.md)

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


## updateChapter

> ChapterDetail updateChapter(chapterId, spaceId, ifMatch, chapterUpdate)

Update Chapter

### Example

```ts
import {
  Configuration,
  ChaptersApi,
} from '';
import type { UpdateChapterRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ChaptersApi();

  const body = {
    // string
    chapterId: chapterId_example,
    // string
    spaceId: spaceId_example,
    // string | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
    // ChapterUpdate
    chapterUpdate: ...,
  } satisfies UpdateChapterRequest;

  try {
    const data = await api.updateChapter(body);
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
| **ifMatch** | `string` | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header. | [Defaults to `undefined`] |
| **chapterUpdate** | [ChapterUpdate](ChapterUpdate.md) |  | |

### Return type

[**ChapterDetail**](ChapterDetail.md)

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

