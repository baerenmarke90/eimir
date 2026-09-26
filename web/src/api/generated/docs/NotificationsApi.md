# NotificationsApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**getNotificationUnreadCount**](NotificationsApi.md#getnotificationunreadcount) | **GET** /api/v1/spaces/{spaceId}/notifications/unread-count | Get Notification Unread Count |
| [**getNotifications**](NotificationsApi.md#getnotifications) | **GET** /api/v1/spaces/{spaceId}/notifications | Get Notifications |
| [**getOwnNotificationPreferences**](NotificationsApi.md#getownnotificationpreferences) | **GET** /api/v1/notification-preferences | Get Own Notification Preferences |
| [**getUnifiedPushConfiguration**](NotificationsApi.md#getunifiedpushconfiguration) | **GET** /api/v1/push-endpoints/unifiedpush-configuration | Get Unified Push Configuration |
| [**markAllNotificationsRead**](NotificationsApi.md#markallnotificationsread) | **POST** /api/v1/spaces/{spaceId}/notifications/read-all | Mark All Notifications Read |
| [**markNotificationRead**](NotificationsApi.md#marknotificationread) | **POST** /api/v1/spaces/{spaceId}/notifications/{notificationId}/read | Mark Notification Read |
| [**registerOwnPushEndpoint**](NotificationsApi.md#registerownpushendpoint) | **POST** /api/v1/push-endpoints | Register Own Push Endpoint |
| [**revokeOwnPushEndpoint**](NotificationsApi.md#revokeownpushendpoint) | **DELETE** /api/v1/push-endpoints/{endpointId} | Revoke Own Push Endpoint |
| [**sendPartnerQuickAction**](NotificationsApi.md#sendpartnerquickaction) | **POST** /api/v1/spaces/{spaceId}/partner-quick-actions | Send Partner Quick Action |
| [**sendThinkingOfYou**](NotificationsApi.md#sendthinkingofyou) | **POST** /api/v1/spaces/{spaceId}/thinking-of-you | Send Thinking Of You |
| [**updateOwnNotificationPreference**](NotificationsApi.md#updateownnotificationpreference) | **PATCH** /api/v1/notification-preferences/{kind}/{channel} | Update Own Notification Preference |
| [**updateOwnQuietHours**](NotificationsApi.md#updateownquiethours) | **PATCH** /api/v1/notification-preferences/quiet-hours | Update Own Quiet Hours |



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


## getOwnNotificationPreferences

> NotificationPreferencesView getOwnNotificationPreferences()

Get Own Notification Preferences

Keep persisted choice, policy eligibility and transport readiness distinct.

### Example

```ts
import {
  Configuration,
  NotificationsApi,
} from '';
import type { GetOwnNotificationPreferencesRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new NotificationsApi();

  try {
    const data = await api.getOwnNotificationPreferences();
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters

This endpoint does not need any parameter.

### Return type

[**NotificationPreferencesView**](NotificationPreferencesView.md)

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
| **503** | A capability required for this operation is not configured on this instance. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getUnifiedPushConfiguration

> UnifiedPushConfiguration getUnifiedPushConfiguration()

Get Unified Push Configuration

Expose the public VAPID key to an authenticated device connector.

### Example

```ts
import {
  Configuration,
  NotificationsApi,
} from '';
import type { GetUnifiedPushConfigurationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new NotificationsApi();

  try {
    const data = await api.getUnifiedPushConfiguration();
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters

This endpoint does not need any parameter.

### Return type

[**UnifiedPushConfiguration**](UnifiedPushConfiguration.md)

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
| **503** | A capability required for this operation is not configured on this instance. |  -  |

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


## registerOwnPushEndpoint

> PushEndpointRegistrationResult registerOwnPushEndpoint(pushEndpointRegistration)

Register Own Push Endpoint

Accept only configured transports and return no endpoint secret.

### Example

```ts
import {
  Configuration,
  NotificationsApi,
} from '';
import type { RegisterOwnPushEndpointRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new NotificationsApi();

  const body = {
    // PushEndpointRegistration
    pushEndpointRegistration: ...,
  } satisfies RegisterOwnPushEndpointRequest;

  try {
    const data = await api.registerOwnPushEndpoint(body);
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
| **pushEndpointRegistration** | [PushEndpointRegistration](PushEndpointRegistration.md) |  | |

### Return type

[**PushEndpointRegistrationResult**](PushEndpointRegistrationResult.md)

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
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |
| **429** | Too many attempts occurred within the allowed time window. |  -  |
| **503** | A capability required for this operation is not configured on this instance. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## revokeOwnPushEndpoint

> revokeOwnPushEndpoint(endpointId)

Revoke Own Push Endpoint

Keep foreign and unknown IDs indistinguishable to the caller.

### Example

```ts
import {
  Configuration,
  NotificationsApi,
} from '';
import type { RevokeOwnPushEndpointRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new NotificationsApi();

  const body = {
    // string
    endpointId: endpointId_example,
  } satisfies RevokeOwnPushEndpointRequest;

  try {
    const data = await api.revokeOwnPushEndpoint(body);
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
| **endpointId** | `string` |  | [Defaults to `undefined`] |

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
| **503** | A capability required for this operation is not configured on this instance. |  -  |

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


## updateOwnNotificationPreference

> NotificationPreferenceUpdated updateOwnNotificationPreference(kind, channel, notificationPreferenceUpdate)

Update Own Notification Preference

Change only the authenticated recipient\&#39;s implemented channel choice.

### Example

```ts
import {
  Configuration,
  NotificationsApi,
} from '';
import type { UpdateOwnNotificationPreferenceRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new NotificationsApi();

  const body = {
    // NotificationKind
    kind: ...,
    // NotificationChannel
    channel: ...,
    // NotificationPreferenceUpdate
    notificationPreferenceUpdate: ...,
  } satisfies UpdateOwnNotificationPreferenceRequest;

  try {
    const data = await api.updateOwnNotificationPreference(body);
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
| **kind** | `NotificationKind` |  | [Defaults to `undefined`] [Enum: COMMENT_CREATED, THINKING_OF_YOU, PARTNER_KISS, PARTNER_CHECK_IN, REMINDER_DUE] |
| **channel** | `NotificationChannel` |  | [Defaults to `undefined`] [Enum: IN_APP, PUSH, EMAIL] |
| **notificationPreferenceUpdate** | [NotificationPreferenceUpdate](NotificationPreferenceUpdate.md) |  | |

### Return type

[**NotificationPreferenceUpdated**](NotificationPreferenceUpdated.md)

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
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |
| **503** | A capability required for this operation is not configured on this instance. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## updateOwnQuietHours

> QuietHoursView updateOwnQuietHours(quietHoursUpdate)

Update Own Quiet Hours

Set or clear only the authenticated recipient\&#39;s daily delivery window.

### Example

```ts
import {
  Configuration,
  NotificationsApi,
} from '';
import type { UpdateOwnQuietHoursRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new NotificationsApi();

  const body = {
    // QuietHoursUpdate
    quietHoursUpdate: ...,
  } satisfies UpdateOwnQuietHoursRequest;

  try {
    const data = await api.updateOwnQuietHours(body);
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
| **quietHoursUpdate** | [QuietHoursUpdate](QuietHoursUpdate.md) |  | |

### Return type

[**QuietHoursView**](QuietHoursView.md)

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
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |
| **503** | A capability required for this operation is not configured on this instance. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

