# NotificationsApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**getNotificationUnreadCount**](NotificationsApi.md#getnotificationunreadcount) | **GET** /api/v1/spaces/{spaceId}/notifications/unread-count | Get Notification Unread Count |
| [**getNotifications**](NotificationsApi.md#getnotifications) | **GET** /api/v1/spaces/{spaceId}/notifications | Get Notifications |
| [**markAllNotificationsRead**](NotificationsApi.md#markallnotificationsread) | **POST** /api/v1/spaces/{spaceId}/notifications/read-all | Mark All Notifications Read |
| [**markNotificationRead**](NotificationsApi.md#marknotificationread) | **POST** /api/v1/spaces/{spaceId}/notifications/{notificationId}/read | Mark Notification Read |
| [**sendPartnerQuickAction**](NotificationsApi.md#sendpartnerquickaction) | **POST** /api/v1/spaces/{spaceId}/partner-quick-actions | Send Partner Quick Action |
| [**sendThinkingOfYou**](NotificationsApi.md#sendthinkingofyou) | **POST** /api/v1/spaces/{spaceId}/thinking-of-you | Send Thinking Of You |



## getNotificationUnreadCount

> NotificationUnreadCount getNotificationUnreadCount(spaceId)

Get Notification Unread Count

### Example

```ts
import {
  Configuration,
  NotificationsApi,
} from '';
import type { GetNotificationUnreadCountRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new NotificationsApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies GetNotificationUnreadCountRequest;

  try {
    const data = await api.getNotificationUnreadCount(body);
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

[**NotificationUnreadCount**](NotificationUnreadCount.md)

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

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getNotifications

> NotificationPage getNotifications(spaceId, cursor, limit)

Get Notifications

### Example

```ts
import {
  Configuration,
  NotificationsApi,
} from '';
import type { GetNotificationsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new NotificationsApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // string (optional)
    cursor: cursor_example,
    // number (optional)
    limit: 56,
  } satisfies GetNotificationsRequest;

  try {
    const data = await api.getNotifications(body);
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
| **limit** | `number` |  | [Optional] [Defaults to `25`] |

### Return type

[**NotificationPage**](NotificationPage.md)

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


## markAllNotificationsRead

> NotificationsReadAllResult markAllNotificationsRead(spaceId)

Mark All Notifications Read

### Example

```ts
import {
  Configuration,
  NotificationsApi,
} from '';
import type { MarkAllNotificationsReadRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new NotificationsApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies MarkAllNotificationsReadRequest;

  try {
    const data = await api.markAllNotificationsRead(body);
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

[**NotificationsReadAllResult**](NotificationsReadAllResult.md)

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

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## markNotificationRead

> NotificationItem markNotificationRead(notificationId, spaceId)

Mark Notification Read

### Example

```ts
import {
  Configuration,
  NotificationsApi,
} from '';
import type { MarkNotificationReadRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new NotificationsApi();

  const body = {
    // string
    notificationId: notificationId_example,
    // string
    spaceId: spaceId_example,
  } satisfies MarkNotificationReadRequest;

  try {
    const data = await api.markNotificationRead(body);
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
| **notificationId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**NotificationItem**](NotificationItem.md)

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

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## sendPartnerQuickAction

> PartnerQuickActionAccepted sendPartnerQuickAction(spaceId, partnerQuickActionCreate)

Send Partner Quick Action

### Example

```ts
import {
  Configuration,
  NotificationsApi,
} from '';
import type { SendPartnerQuickActionRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new NotificationsApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // PartnerQuickActionCreate
    partnerQuickActionCreate: ...,
  } satisfies SendPartnerQuickActionRequest;

  try {
    const data = await api.sendPartnerQuickAction(body);
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
| **partnerQuickActionCreate** | [PartnerQuickActionCreate](PartnerQuickActionCreate.md) |  | |

### Return type

[**PartnerQuickActionAccepted**](PartnerQuickActionAccepted.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **202** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |
| **429** | Too many attempts occurred within the allowed time window. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## sendThinkingOfYou

> ThinkingOfYouAccepted sendThinkingOfYou(spaceId, thinkingOfYouCreate)

Send Thinking Of You

### Example

```ts
import {
  Configuration,
  NotificationsApi,
} from '';
import type { SendThinkingOfYouRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new NotificationsApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // ThinkingOfYouCreate
    thinkingOfYouCreate: ...,
  } satisfies SendThinkingOfYouRequest;

  try {
    const data = await api.sendThinkingOfYou(body);
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
| **thinkingOfYouCreate** | [ThinkingOfYouCreate](ThinkingOfYouCreate.md) |  | |

### Return type

[**ThinkingOfYouAccepted**](ThinkingOfYouAccepted.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **202** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |
| **429** | Too many attempts occurred within the allowed time window. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

