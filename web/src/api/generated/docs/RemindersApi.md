# RemindersApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**createReminder**](RemindersApi.md#createreminder) | **POST** /api/v1/spaces/{spaceId}/reminders | Create Reminder |
| [**deleteReminder**](RemindersApi.md#deletereminder) | **DELETE** /api/v1/spaces/{spaceId}/reminders/{reminderId} | Delete Reminder |
| [**getReminder**](RemindersApi.md#getreminder) | **GET** /api/v1/spaces/{spaceId}/reminders/{reminderId} | Get Reminder |
| [**listReminders**](RemindersApi.md#listreminders) | **GET** /api/v1/spaces/{spaceId}/reminders | List Reminders |
| [**setReminderPreference**](RemindersApi.md#setreminderpreference) | **PUT** /api/v1/spaces/{spaceId}/reminders/{reminderId}/preference | Set Reminder Preference |
| [**updateReminder**](RemindersApi.md#updatereminder) | **PUT** /api/v1/spaces/{spaceId}/reminders/{reminderId} | Update Reminder |



## createReminder

> ReminderDetail createReminder(spaceId, reminderWrite)

Create Reminder

### Example

```ts
import {
  Configuration,
  RemindersApi,
} from '';
import type { CreateReminderRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new RemindersApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // ReminderWrite
    reminderWrite: ...,
  } satisfies CreateReminderRequest;

  try {
    const data = await api.createReminder(body);
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
| **reminderWrite** | [ReminderWrite](ReminderWrite.md) |  | |

### Return type

[**ReminderDetail**](ReminderDetail.md)

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


## deleteReminder

> deleteReminder(reminderId, spaceId, ifMatch)

Delete Reminder

### Example

```ts
import {
  Configuration,
  RemindersApi,
} from '';
import type { DeleteReminderRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new RemindersApi();

  const body = {
    // string
    reminderId: reminderId_example,
    // string
    spaceId: spaceId_example,
    // string | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
  } satisfies DeleteReminderRequest;

  try {
    const data = await api.deleteReminder(body);
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
| **reminderId** | `string` |  | [Defaults to `undefined`] |
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


## getReminder

> ReminderDetail getReminder(reminderId, spaceId)

Get Reminder

### Example

```ts
import {
  Configuration,
  RemindersApi,
} from '';
import type { GetReminderRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new RemindersApi();

  const body = {
    // string
    reminderId: reminderId_example,
    // string
    spaceId: spaceId_example,
  } satisfies GetReminderRequest;

  try {
    const data = await api.getReminder(body);
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
| **reminderId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**ReminderDetail**](ReminderDetail.md)

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


## listReminders

> ReminderList listReminders(spaceId)

List Reminders

### Example

```ts
import {
  Configuration,
  RemindersApi,
} from '';
import type { ListRemindersRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new RemindersApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies ListRemindersRequest;

  try {
    const data = await api.listReminders(body);
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

[**ReminderList**](ReminderList.md)

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


## setReminderPreference

> ReminderPreferenceView setReminderPreference(reminderId, spaceId, reminderPreferenceUpdate)

Set Reminder Preference

### Example

```ts
import {
  Configuration,
  RemindersApi,
} from '';
import type { SetReminderPreferenceRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new RemindersApi();

  const body = {
    // string
    reminderId: reminderId_example,
    // string
    spaceId: spaceId_example,
    // ReminderPreferenceUpdate
    reminderPreferenceUpdate: ...,
  } satisfies SetReminderPreferenceRequest;

  try {
    const data = await api.setReminderPreference(body);
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
| **reminderId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **reminderPreferenceUpdate** | [ReminderPreferenceUpdate](ReminderPreferenceUpdate.md) |  | |

### Return type

[**ReminderPreferenceView**](ReminderPreferenceView.md)

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
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## updateReminder

> ReminderDetail updateReminder(reminderId, spaceId, ifMatch, reminderWrite)

Update Reminder

### Example

```ts
import {
  Configuration,
  RemindersApi,
} from '';
import type { UpdateReminderRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new RemindersApi();

  const body = {
    // string
    reminderId: reminderId_example,
    // string
    spaceId: spaceId_example,
    // string | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
    // ReminderWrite
    reminderWrite: ...,
  } satisfies UpdateReminderRequest;

  try {
    const data = await api.updateReminder(body);
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
| **reminderId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **ifMatch** | `string` | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header. | [Defaults to `undefined`] |
| **reminderWrite** | [ReminderWrite](ReminderWrite.md) |  | |

### Return type

[**ReminderDetail**](ReminderDetail.md)

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

