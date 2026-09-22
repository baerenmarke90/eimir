# DailyCheckInsApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**getDailyCheckInInsights**](DailyCheckInsApi.md#getdailycheckininsights) | **GET** /api/v1/spaces/{spaceId}/daily-check-in/insights | Get Daily Check In Insights |
| [**getDailyCheckInToday**](DailyCheckInsApi.md#getdailycheckintoday) | **GET** /api/v1/spaces/{spaceId}/daily-check-in/today | Get Daily Check In Today |
| [**updateDailyCheckInToday**](DailyCheckInsApi.md#updatedailycheckintoday) | **PATCH** /api/v1/spaces/{spaceId}/daily-check-in/today | Update Daily Check In Today |



## getDailyCheckInInsights

> DailyCheckInInsightsView getDailyCheckInInsights(spaceId, startDate, endDate)

Get Daily Check In Insights

Return longitudinal Daily Check-in insights for the authorized Space.  Protected by the Pro capability &#x60;daily.insights&#x60;. Free Spaces receive 403 Forbidden with &#x60;PREMIUM_ENTITLEMENT_REQUIRED&#x60;.

### Example

```ts
import {
  Configuration,
  DailyCheckInsApi,
} from '';
import type { GetDailyCheckInInsightsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DailyCheckInsApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // Date (optional)
    startDate: 2013-10-20,
    // Date (optional)
    endDate: 2013-10-20,
  } satisfies GetDailyCheckInInsightsRequest;

  try {
    const data = await api.getDailyCheckInInsights(body);
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
| **startDate** | `Date` |  | [Optional] [Defaults to `undefined`] |
| **endDate** | `Date` |  | [Optional] [Defaults to `undefined`] |

### Return type

[**DailyCheckInInsightsView**](DailyCheckInInsightsView.md)

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
| **403** | &#x60;PREMIUM_ENTITLEMENT_REQUIRED&#x60;: Pro capability &#x60;daily.insights&#x60; required. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | &#x60;DAILY_CHECK_IN_CONTEXT_UNAVAILABLE&#x60;: the Space has no valid authoritative Daily Check-in time zone. |  -  |
| **422** | &#x60;DAILY_CHECK_IN_VIBE_NOTE_REQUIRES_VIBE&#x60;: Vibe context requires a current-day Vibe. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getDailyCheckInToday

> DailyCheckInTodayView getDailyCheckInToday(spaceId)

Get Daily Check In Today

### Example

```ts
import {
  Configuration,
  DailyCheckInsApi,
} from '';
import type { GetDailyCheckInTodayRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DailyCheckInsApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies GetDailyCheckInTodayRequest;

  try {
    const data = await api.getDailyCheckInToday(body);
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

[**DailyCheckInTodayView**](DailyCheckInTodayView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  * ETag - Opaque owner-state concurrency token. Send it unchanged in the next Daily Check-in write request\&#39;s &#x60;If-Match&#x60; header. <br>  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | &#x60;DAILY_CHECK_IN_CONTEXT_UNAVAILABLE&#x60;: the Space has no valid authoritative Daily Check-in time zone. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## updateDailyCheckInToday

> DailyCheckInTodayView updateDailyCheckInToday(spaceId, ifMatch, dailyCheckInUpdate)

Update Daily Check In Today

### Example

```ts
import {
  Configuration,
  DailyCheckInsApi,
} from '';
import type { UpdateDailyCheckInTodayRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DailyCheckInsApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // string | The last-read opaque resource state, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
    // DailyCheckInUpdate
    dailyCheckInUpdate: ...,
  } satisfies UpdateDailyCheckInTodayRequest;

  try {
    const data = await api.updateDailyCheckInToday(body);
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
| **dailyCheckInUpdate** | [DailyCheckInUpdate](DailyCheckInUpdate.md) |  | |

### Return type

[**DailyCheckInTodayView**](DailyCheckInTodayView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  * ETag - Opaque owner-state concurrency token. Send it unchanged in the next Daily Check-in write request\&#39;s &#x60;If-Match&#x60; header. <br>  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | &#x60;SPACE_MODULE_DISABLED&#x60;: new Vibe/Energy participation is disabled. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | &#x60;RESOURCE_VERSION_CONFLICT&#x60;: the owner state changed, or &#x60;DAILY_CHECK_IN_CONTEXT_UNAVAILABLE&#x60;: the shared day cannot be resolved. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

