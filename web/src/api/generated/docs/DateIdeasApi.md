# DateIdeasApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**getDateIdeaImage**](DateIdeasApi.md#getdateideaimage) | **GET** /api/v1/spaces/{spaceId}/date-ideas/images/{imageId} | Get Date Idea Image |
| [**listDateIdeas**](DateIdeasApi.md#listdateideas) | **GET** /api/v1/spaces/{spaceId}/date-ideas | List Date Ideas |



## getDateIdeaImage

> Blob getDateIdeaImage(imageId, spaceId)

Get Date Idea Image

One editorial catalog image (WebP). Protected like the catalog itself.

### Example

```ts
import {
  Configuration,
  DateIdeasApi,
} from '';
import type { GetDateIdeaImageRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DateIdeasApi();

  const body = {
    // string
    imageId: imageId_example,
    // string
    spaceId: spaceId_example,
  } satisfies GetDateIdeaImageRequest;

  try {
    const data = await api.getDateIdeaImage(body);
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
| **imageId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

**Blob**

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `image/webp`, `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | &#x60;PREMIUM_ENTITLEMENT_REQUIRED&#x60;: Space lacks the Pro capability &#x60;planning.date_inspiration&#x60;. |  -  |
| **404** | &#x60;DATE_IDEA_IMAGE_NOT_FOUND&#x60; or &#x60;SPACE_NOT_FOUND&#x60;. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## listDateIdeas

> DateIdeaCatalog listDateIdeas(spaceId, locale, category, maxMinutes, maxBudget, place)

List Date Ideas

Curated ideas in editorial order; all filters combine with AND.  &#x60;maxMinutes&#x60; and &#x60;maxBudget&#x60; are inclusive upper bounds; &#x60;maxBudget&#x3D;0&#x60; selects ideas without new spending. Omitting &#x60;place&#x60; means anywhere.

### Example

```ts
import {
  Configuration,
  DateIdeasApi,
} from '';
import type { ListDateIdeasRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DateIdeasApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // string (optional)
    locale: locale_example,
    // DateIdeaCategory (optional)
    category: ...,
    // number (optional)
    maxMinutes: 56,
    // number (optional)
    maxBudget: 56,
    // DateIdeaPlaceType (optional)
    place: ...,
  } satisfies ListDateIdeasRequest;

  try {
    const data = await api.listDateIdeas(body);
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
| **locale** | `string` |  | [Optional] [Defaults to `undefined`] |
| **category** | `DateIdeaCategory` |  | [Optional] [Defaults to `undefined`] [Enum: food_drink, creative, play, nature, culture, movement, relaxation, connection, memories, discovery] |
| **maxMinutes** | `number` |  | [Optional] [Defaults to `undefined`] |
| **maxBudget** | `number` |  | [Optional] [Defaults to `undefined`] |
| **place** | `DateIdeaPlaceType` |  | [Optional] [Defaults to `undefined`] [Enum: home, out] |

### Return type

[**DateIdeaCatalog**](DateIdeaCatalog.md)

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
| **403** | &#x60;PREMIUM_ENTITLEMENT_REQUIRED&#x60;: Space lacks the Pro capability &#x60;planning.date_inspiration&#x60;. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

