# DailyQuoteApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**getDailyQuote**](DailyQuoteApi.md#getdailyquote) | **GET** /api/v1/spaces/{spaceId}/daily-quote | Get Daily Quote |
| [**getDailyQuoteCatalog**](DailyQuoteApi.md#getdailyquotecatalog) | **GET** /api/v1/spaces/{spaceId}/daily-quote/catalog | Get Daily Quote Catalog |
| [**getDailyQuotePreferences**](DailyQuoteApi.md#getdailyquotepreferences) | **GET** /api/v1/spaces/{spaceId}/daily-quote/preferences | Get Daily Quote Preferences |
| [**updateDailyQuotePreferences**](DailyQuoteApi.md#updatedailyquotepreferences) | **PATCH** /api/v1/spaces/{spaceId}/daily-quote/preferences | Update Daily Quote Preferences |



## getDailyQuote

> DailyQuoteResponse getDailyQuote(spaceId)

Get Daily Quote

Return the deterministic quote of the day for the authorized caller.  Requires that the Space holds the &#x60;daily.quote&#x60; Pro entitlement.

### Example

```ts
import {
  Configuration,
  DailyQuoteApi,
} from '';
import type { GetDailyQuoteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DailyQuoteApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies GetDailyQuoteRequest;

  try {
    const data = await api.getDailyQuote(body);
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

[**DailyQuoteResponse**](DailyQuoteResponse.md)

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
| **403** | &#x60;PREMIUM_ENTITLEMENT_REQUIRED&#x60;: Space lacks the Pro capability &#x60;daily.quote&#x60;. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getDailyQuoteCatalog

> DailyQuoteCatalogView getDailyQuoteCatalog(spaceId)

Get Daily Quote Catalog

Return available curated sources and categories for the preference editor.

### Example

```ts
import {
  Configuration,
  DailyQuoteApi,
} from '';
import type { GetDailyQuoteCatalogRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DailyQuoteApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies GetDailyQuoteCatalogRequest;

  try {
    const data = await api.getDailyQuoteCatalog(body);
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

[**DailyQuoteCatalogView**](DailyQuoteCatalogView.md)

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
| **403** | &#x60;PREMIUM_ENTITLEMENT_REQUIRED&#x60;: Space lacks the Pro capability &#x60;daily.quote&#x60;. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getDailyQuotePreferences

> DailyQuotePreferenceView getDailyQuotePreferences(spaceId)

Get Daily Quote Preferences

Return caller\&#39;s personal Daily Quote preferences.  Protected by &#x60;daily.quote&#x60;. Returns only the caller\&#39;s own preferences.

### Example

```ts
import {
  Configuration,
  DailyQuoteApi,
} from '';
import type { GetDailyQuotePreferencesRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DailyQuoteApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies GetDailyQuotePreferencesRequest;

  try {
    const data = await api.getDailyQuotePreferences(body);
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

[**DailyQuotePreferenceView**](DailyQuotePreferenceView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  * ETag - Opaque preference concurrency token. Send it unchanged in subsequent PATCH requests in the &#x60;If-Match&#x60; header. <br>  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | &#x60;PREMIUM_ENTITLEMENT_REQUIRED&#x60;: Space lacks the Pro capability &#x60;daily.quote&#x60;. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## updateDailyQuotePreferences

> DailyQuotePreferenceView updateDailyQuotePreferences(spaceId, ifMatch, dailyQuotePreferencePatch)

Update Daily Quote Preferences

Update caller\&#39;s personal Daily Quote preferences.  Requires &#x60;If-Match&#x60; optimistic concurrency header. Protected by &#x60;daily.quote&#x60;. Cannot modify partner preferences.

### Example

```ts
import {
  Configuration,
  DailyQuoteApi,
} from '';
import type { UpdateDailyQuotePreferencesRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DailyQuoteApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // string | The last-read opaque resource state, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
    // DailyQuotePreferencePatch
    dailyQuotePreferencePatch: ...,
  } satisfies UpdateDailyQuotePreferencesRequest;

  try {
    const data = await api.updateDailyQuotePreferences(body);
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
| **ifMatch** | `string` | The last-read opaque resource state, encoded as a strong ETag. Writes are rejected without this header. | [Defaults to `undefined`] |
| **dailyQuotePreferencePatch** | [DailyQuotePreferencePatch](DailyQuotePreferencePatch.md) |  | |

### Return type

[**DailyQuotePreferenceView**](DailyQuotePreferenceView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  * ETag - Opaque preference concurrency token. Send it unchanged in subsequent PATCH requests in the &#x60;If-Match&#x60; header. <br>  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | &#x60;PREMIUM_ENTITLEMENT_REQUIRED&#x60;: Space lacks the Pro capability &#x60;daily.quote&#x60;. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | &#x60;RESOURCE_VERSION_CONFLICT&#x60;: preferences changed since they were read. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

