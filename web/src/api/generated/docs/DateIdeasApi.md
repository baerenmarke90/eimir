# DateIdeasApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**listDateIdeas**](DateIdeasApi.md#listdateideas) | **GET** /api/v1/spaces/{spaceId}/date-ideas | List Date Ideas |
| [**saveDateIdeaAsWish**](DateIdeasApi.md#savedateideaaswish) | **POST** /api/v1/spaces/{spaceId}/date-ideas/{ideaId}/wish | Save Date Idea As Wish |



## listDateIdeas

> DateIdeaCatalog listDateIdeas(spaceId, locale, category, duration, budget, setting)

List Date Ideas

Curated ideas in deterministic editorial order; all filters combine with AND.  A &#x60;HOME&#x60; or &#x60;OUT&#x60; setting filter also returns ideas that work in both settings. An unknown category yields an empty result rather than an error, so a client holding an older catalog degrades gracefully.

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
    // string (optional)
    category: category_example,
    // DurationBand (optional)
    duration: ...,
    // BudgetBand (optional)
    budget: ...,
    // SettingFilter (optional)
    setting: ...,
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
| **category** | `string` |  | [Optional] [Defaults to `undefined`] |
| **duration** | `DurationBand` |  | [Optional] [Defaults to `undefined`] [Enum: SHORT, EVENING, LONG] |
| **budget** | `BudgetBand` |  | [Optional] [Defaults to `undefined`] [Enum: FREE, LOW, MEDIUM, HIGH] |
| **setting** | `SettingFilter` |  | [Optional] [Defaults to `undefined`] [Enum: HOME, OUT] |

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


## saveDateIdeaAsWish

> WishDetail saveDateIdeaAsWish(ideaId, spaceId, dateIdeaWishCreate, idempotencyKey)

Save Date Idea As Wish

Create a regular shared Wish from a curated idea, at most once while it is open.

### Example

```ts
import {
  Configuration,
  DateIdeasApi,
} from '';
import type { SaveDateIdeaAsWishRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DateIdeasApi();

  const body = {
    // string
    ideaId: ideaId_example,
    // string
    spaceId: spaceId_example,
    // DateIdeaWishCreate
    dateIdeaWishCreate: ...,
    // string | Optional request identity (a UUID chosen by the client for one save). Repeating the same request with the same key returns the original result instead of creating it again; the key is scoped to the authenticated Account and Space and is retained for a bounded time. (optional)
    idempotencyKey: idempotencyKey_example,
  } satisfies SaveDateIdeaAsWishRequest;

  try {
    const data = await api.saveDateIdeaAsWish(body);
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
| **ideaId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **dateIdeaWishCreate** | [DateIdeaWishCreate](DateIdeaWishCreate.md) |  | |
| **idempotencyKey** | `string` | Optional request identity (a UUID chosen by the client for one save). Repeating the same request with the same key returns the original result instead of creating it again; the key is scoped to the authenticated Account and Space and is retained for a bounded time. | [Optional] [Defaults to `undefined`] |

### Return type

[**WishDetail**](WishDetail.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | The idea is already saved as an open or planned Wish of this Space, or this replays an earlier request with the same &#x60;Idempotency-Key&#x60;. |  * ETag - Resource version to use for the next If-Match write request. <br>  |
| **201** | Successful Response |  * ETag - Resource version to use for the next If-Match write request. <br>  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | &#x60;PREMIUM_ENTITLEMENT_REQUIRED&#x60;: Space lacks the Pro capability &#x60;planning.date_inspiration&#x60;. |  -  |
| **404** | &#x60;DATE_IDEA_NOT_FOUND&#x60;, &#x60;SPACE_NOT_FOUND&#x60; or &#x60;WISH_CREATE_RESULT_DELETED&#x60;. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

