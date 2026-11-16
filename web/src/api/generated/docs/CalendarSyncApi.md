# CalendarSyncApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**confirmCalendarConnection**](CalendarSyncApi.md#confirmcalendarconnection) | **POST** /api/v1/spaces/{spaceId}/calendar-sync/connections/{connectionId}/confirm | Confirm Connection |
| [**connectCalDavCalendar**](CalendarSyncApi.md#connectcaldavcalendar) | **POST** /api/v1/spaces/{spaceId}/calendar-sync/connections/caldav | Connect Caldav |
| [**endCalendarSyncTarget**](CalendarSyncApi.md#endcalendarsynctarget) | **DELETE** /api/v1/spaces/{spaceId}/calendar-sync/target | End Target |
| [**getCalendarSync**](CalendarSyncApi.md#getcalendarsync) | **GET** /api/v1/spaces/{spaceId}/calendar-sync | Get Calendar Sync |
| [**getPlanCalendarSync**](CalendarSyncApi.md#getplancalendarsync) | **GET** /api/v1/spaces/{spaceId}/calendar-sync/plans/{planId} | Plan Sync |
| [**listConnectionCalendars**](CalendarSyncApi.md#listconnectioncalendars) | **GET** /api/v1/spaces/{spaceId}/calendar-sync/connections/{connectionId}/calendars | List Connection Calendars |
| [**pauseCalendarSyncTarget**](CalendarSyncApi.md#pausecalendarsynctarget) | **POST** /api/v1/spaces/{spaceId}/calendar-sync/target/pause | Pause Target |
| [**removeCalendarConnection**](CalendarSyncApi.md#removecalendarconnection) | **DELETE** /api/v1/spaces/{spaceId}/calendar-sync/connections/{connectionId} | Remove Connection |
| [**requestCalendarSync**](CalendarSyncApi.md#requestcalendarsync) | **POST** /api/v1/spaces/{spaceId}/calendar-sync/sync | Request Sync |
| [**resolvePlanCalendarConflict**](CalendarSyncApi.md#resolveplancalendarconflict) | **POST** /api/v1/spaces/{spaceId}/calendar-sync/plans/{planId}/resolve | Resolve Conflict |
| [**resumeCalendarSyncTarget**](CalendarSyncApi.md#resumecalendarsynctarget) | **POST** /api/v1/spaces/{spaceId}/calendar-sync/target/resume | Resume Target |
| [**setCalendarSyncTarget**](CalendarSyncApi.md#setcalendarsynctarget) | **PUT** /api/v1/spaces/{spaceId}/calendar-sync/target | Set Target |
| [**startGoogleCalendarConnection**](CalendarSyncApi.md#startgooglecalendarconnection) | **POST** /api/v1/spaces/{spaceId}/calendar-sync/connections/google | Start Google |



## confirmCalendarConnection

> CalendarConnectionCreated confirmCalendarConnection(connectionId, spaceId)

Confirm Connection

### Example

```ts
import {
  Configuration,
  CalendarSyncApi,
} from '';
import type { ConfirmCalendarConnectionRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new CalendarSyncApi();

  const body = {
    // string
    connectionId: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    spaceId: spaceId_example,
  } satisfies ConfirmCalendarConnectionRequest;

  try {
    const data = await api.confirmCalendarConnection(body);
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
| **connectionId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**CalendarConnectionCreated**](CalendarConnectionCreated.md)

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
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |
| **503** | A capability required for this operation is not configured on this instance. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## connectCalDavCalendar

> CalendarConnectionCreated connectCalDavCalendar(spaceId, calDavConnectionCreate)

Connect Caldav

### Example

```ts
import {
  Configuration,
  CalendarSyncApi,
} from '';
import type { ConnectCalDavCalendarRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new CalendarSyncApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // CalDavConnectionCreate
    calDavConnectionCreate: ...,
  } satisfies ConnectCalDavCalendarRequest;

  try {
    const data = await api.connectCalDavCalendar(body);
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
| **calDavConnectionCreate** | [CalDavConnectionCreate](CalDavConnectionCreate.md) |  | |

### Return type

[**CalendarConnectionCreated**](CalendarConnectionCreated.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **201** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |
| **429** | Too many attempts occurred within the allowed time window. |  -  |
| **503** | A capability required for this operation is not configured on this instance. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## endCalendarSyncTarget

> CalendarSyncView endCalendarSyncTarget(spaceId, ifMatch)

End Target

### Example

```ts
import {
  Configuration,
  CalendarSyncApi,
} from '';
import type { EndCalendarSyncTargetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new CalendarSyncApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // string | The last-read opaque resource state, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
  } satisfies EndCalendarSyncTargetRequest;

  try {
    const data = await api.endCalendarSyncTarget(body);
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

### Return type

[**CalendarSyncView**](CalendarSyncView.md)

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
| **409** | The request conflicts with the current state of the resource. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getCalendarSync

> CalendarSyncView getCalendarSync(spaceId)

Get Calendar Sync

### Example

```ts
import {
  Configuration,
  CalendarSyncApi,
} from '';
import type { GetCalendarSyncRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new CalendarSyncApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies GetCalendarSyncRequest;

  try {
    const data = await api.getCalendarSync(body);
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

[**CalendarSyncView**](CalendarSyncView.md)

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


## getPlanCalendarSync

> PlanCalendarSyncView getPlanCalendarSync(planId, spaceId)

Plan Sync

### Example

```ts
import {
  Configuration,
  CalendarSyncApi,
} from '';
import type { GetPlanCalendarSyncRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new CalendarSyncApi();

  const body = {
    // string
    planId: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    spaceId: spaceId_example,
  } satisfies GetPlanCalendarSyncRequest;

  try {
    const data = await api.getPlanCalendarSync(body);
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

[**PlanCalendarSyncView**](PlanCalendarSyncView.md)

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


## listConnectionCalendars

> CalendarList listConnectionCalendars(connectionId, spaceId)

List Connection Calendars

### Example

```ts
import {
  Configuration,
  CalendarSyncApi,
} from '';
import type { ListConnectionCalendarsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new CalendarSyncApi();

  const body = {
    // string
    connectionId: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    spaceId: spaceId_example,
  } satisfies ListConnectionCalendarsRequest;

  try {
    const data = await api.listConnectionCalendars(body);
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
| **connectionId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**CalendarList**](CalendarList.md)

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
| **422** | Request parameters or domain inputs are invalid. |  -  |
| **503** | A capability required for this operation is not configured on this instance. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## pauseCalendarSyncTarget

> CalendarSyncView pauseCalendarSyncTarget(spaceId, ifMatch)

Pause Target

### Example

```ts
import {
  Configuration,
  CalendarSyncApi,
} from '';
import type { PauseCalendarSyncTargetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new CalendarSyncApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // string | The last-read opaque resource state, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
  } satisfies PauseCalendarSyncTargetRequest;

  try {
    const data = await api.pauseCalendarSyncTarget(body);
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

### Return type

[**CalendarSyncView**](CalendarSyncView.md)

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
| **409** | The request conflicts with the current state of the resource. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## removeCalendarConnection

> removeCalendarConnection(connectionId, spaceId)

Remove Connection

### Example

```ts
import {
  Configuration,
  CalendarSyncApi,
} from '';
import type { RemoveCalendarConnectionRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new CalendarSyncApi();

  const body = {
    // string
    connectionId: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    spaceId: spaceId_example,
  } satisfies RemoveCalendarConnectionRequest;

  try {
    const data = await api.removeCalendarConnection(body);
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
| **connectionId** | `string` |  | [Defaults to `undefined`] |
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


## requestCalendarSync

> CalendarSyncView requestCalendarSync(spaceId)

Request Sync

### Example

```ts
import {
  Configuration,
  CalendarSyncApi,
} from '';
import type { RequestCalendarSyncRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new CalendarSyncApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies RequestCalendarSyncRequest;

  try {
    const data = await api.requestCalendarSync(body);
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

[**CalendarSyncView**](CalendarSyncView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **202** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **503** | A capability required for this operation is not configured on this instance. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## resolvePlanCalendarConflict

> PlanCalendarSyncView resolvePlanCalendarConflict(planId, spaceId, calendarConflictResolution)

Resolve Conflict

### Example

```ts
import {
  Configuration,
  CalendarSyncApi,
} from '';
import type { ResolvePlanCalendarConflictRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new CalendarSyncApi();

  const body = {
    // string
    planId: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    spaceId: spaceId_example,
    // CalendarConflictResolution
    calendarConflictResolution: ...,
  } satisfies ResolvePlanCalendarConflictRequest;

  try {
    const data = await api.resolvePlanCalendarConflict(body);
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
| **calendarConflictResolution** | [CalendarConflictResolution](CalendarConflictResolution.md) |  | |

### Return type

[**PlanCalendarSyncView**](PlanCalendarSyncView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |
| **503** | A capability required for this operation is not configured on this instance. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## resumeCalendarSyncTarget

> CalendarSyncView resumeCalendarSyncTarget(spaceId, ifMatch)

Resume Target

### Example

```ts
import {
  Configuration,
  CalendarSyncApi,
} from '';
import type { ResumeCalendarSyncTargetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new CalendarSyncApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // string | The last-read opaque resource state, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
  } satisfies ResumeCalendarSyncTargetRequest;

  try {
    const data = await api.resumeCalendarSyncTarget(body);
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

### Return type

[**CalendarSyncView**](CalendarSyncView.md)

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
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |
| **503** | A capability required for this operation is not configured on this instance. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## setCalendarSyncTarget

> CalendarSyncView setCalendarSyncTarget(spaceId, ifMatch, spaceCalendarTargetSave)

Set Target

### Example

```ts
import {
  Configuration,
  CalendarSyncApi,
} from '';
import type { SetCalendarSyncTargetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new CalendarSyncApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // string | The last-read opaque resource state, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
    // SpaceCalendarTargetSave
    spaceCalendarTargetSave: ...,
  } satisfies SetCalendarSyncTargetRequest;

  try {
    const data = await api.setCalendarSyncTarget(body);
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
| **spaceCalendarTargetSave** | [SpaceCalendarTargetSave](SpaceCalendarTargetSave.md) |  | |

### Return type

[**CalendarSyncView**](CalendarSyncView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |
| **503** | A capability required for this operation is not configured on this instance. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## startGoogleCalendarConnection

> GoogleCalendarStart startGoogleCalendarConnection(spaceId, googleCalendarStartRequest)

Start Google

### Example

```ts
import {
  Configuration,
  CalendarSyncApi,
} from '';
import type { StartGoogleCalendarConnectionRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new CalendarSyncApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // GoogleCalendarStartRequest (optional)
    googleCalendarStartRequest: ...,
  } satisfies StartGoogleCalendarConnectionRequest;

  try {
    const data = await api.startGoogleCalendarConnection(body);
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
| **googleCalendarStartRequest** | [GoogleCalendarStartRequest](GoogleCalendarStartRequest.md) |  | [Optional] |

### Return type

[**GoogleCalendarStart**](GoogleCalendarStart.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **201** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **429** | Too many attempts occurred within the allowed time window. |  -  |
| **503** | A capability required for this operation is not configured on this instance. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

