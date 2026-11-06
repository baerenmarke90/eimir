# OnceMessagesApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**acknowledgeOnceMessage**](OnceMessagesApi.md#acknowledgeoncemessage) | **POST** /api/v1/spaces/{spaceId}/once-messages/{messageId}/acknowledge | Acknowledge |
| [**discardOnceMessage**](OnceMessagesApi.md#discardoncemessage) | **DELETE** /api/v1/spaces/{spaceId}/once-messages/{messageId} | Discard |
| [**getOnceMessageStatus**](OnceMessagesApi.md#getoncemessagestatus) | **GET** /api/v1/spaces/{spaceId}/once-messages/status | Get Status |
| [**getSealedOnceMessage**](OnceMessagesApi.md#getsealedoncemessage) | **GET** /api/v1/spaces/{spaceId}/once-messages/{messageId} | Get Message |
| [**listOnceMessages**](OnceMessagesApi.md#listoncemessages) | **GET** /api/v1/spaces/{spaceId}/once-messages | Inbox |
| [**openOnceMessage**](OnceMessagesApi.md#openoncemessage) | **POST** /api/v1/spaces/{spaceId}/once-messages/{messageId}/open | Open Message |
| [**sendOnceMessage**](OnceMessagesApi.md#sendoncemessage) | **POST** /api/v1/spaces/{spaceId}/once-messages | Send |
| [**setOnceMessageReception**](OnceMessagesApi.md#setoncemessagereception) | **PUT** /api/v1/spaces/{spaceId}/once-messages/reception | Reception |



## acknowledgeOnceMessage

> acknowledgeOnceMessage(messageId, spaceId, onceAcknowledgement)

Acknowledge

### Example

```ts
import {
  Configuration,
  OnceMessagesApi,
} from '';
import type { AcknowledgeOnceMessageRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new OnceMessagesApi();

  const body = {
    // string
    messageId: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    spaceId: spaceId_example,
    // OnceAcknowledgement
    onceAcknowledgement: ...,
  } satisfies AcknowledgeOnceMessageRequest;

  try {
    const data = await api.acknowledgeOnceMessage(body);
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
| **messageId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **onceAcknowledgement** | [OnceAcknowledgement](OnceAcknowledgement.md) |  | |

### Return type

`void` (Empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **204** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## discardOnceMessage

> discardOnceMessage(messageId, spaceId)

Discard

### Example

```ts
import {
  Configuration,
  OnceMessagesApi,
} from '';
import type { DiscardOnceMessageRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new OnceMessagesApi();

  const body = {
    // string
    messageId: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    spaceId: spaceId_example,
  } satisfies DiscardOnceMessageRequest;

  try {
    const data = await api.discardOnceMessage(body);
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
| **messageId** | `string` |  | [Defaults to `undefined`] |
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


## getOnceMessageStatus

> OnceStatus getOnceMessageStatus(spaceId)

Get Status

### Example

```ts
import {
  Configuration,
  OnceMessagesApi,
} from '';
import type { GetOnceMessageStatusRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new OnceMessagesApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies GetOnceMessageStatusRequest;

  try {
    const data = await api.getOnceMessageStatus(body);
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

[**OnceStatus**](OnceStatus.md)

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


## getSealedOnceMessage

> OnceSealedMessage getSealedOnceMessage(messageId, spaceId)

Get Message

### Example

```ts
import {
  Configuration,
  OnceMessagesApi,
} from '';
import type { GetSealedOnceMessageRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new OnceMessagesApi();

  const body = {
    // string
    messageId: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    spaceId: spaceId_example,
  } satisfies GetSealedOnceMessageRequest;

  try {
    const data = await api.getSealedOnceMessage(body);
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
| **messageId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**OnceSealedMessage**](OnceSealedMessage.md)

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


## listOnceMessages

> OnceInbox listOnceMessages(spaceId)

Inbox

### Example

```ts
import {
  Configuration,
  OnceMessagesApi,
} from '';
import type { ListOnceMessagesRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new OnceMessagesApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies ListOnceMessagesRequest;

  try {
    const data = await api.listOnceMessages(body);
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

[**OnceInbox**](OnceInbox.md)

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


## openOnceMessage

> OnceClaimedMessage openOnceMessage(messageId, spaceId, onceClaim)

Open Message

### Example

```ts
import {
  Configuration,
  OnceMessagesApi,
} from '';
import type { OpenOnceMessageRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new OnceMessagesApi();

  const body = {
    // string
    messageId: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    spaceId: spaceId_example,
    // OnceClaim
    onceClaim: ...,
  } satisfies OpenOnceMessageRequest;

  try {
    const data = await api.openOnceMessage(body);
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
| **messageId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **onceClaim** | [OnceClaim](OnceClaim.md) |  | |

### Return type

[**OnceClaimedMessage**](OnceClaimedMessage.md)

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
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## sendOnceMessage

> OnceMessageSent sendOnceMessage(spaceId, onceMessageCreate)

Send

### Example

```ts
import {
  Configuration,
  OnceMessagesApi,
} from '';
import type { SendOnceMessageRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new OnceMessagesApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // OnceMessageCreate
    onceMessageCreate: ...,
  } satisfies SendOnceMessageRequest;

  try {
    const data = await api.sendOnceMessage(body);
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
| **onceMessageCreate** | [OnceMessageCreate](OnceMessageCreate.md) |  | |

### Return type

[**OnceMessageSent**](OnceMessageSent.md)

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

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## setOnceMessageReception

> OnceStatus setOnceMessageReception(spaceId, onceReceptionUpdate)

Reception

### Example

```ts
import {
  Configuration,
  OnceMessagesApi,
} from '';
import type { SetOnceMessageReceptionRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new OnceMessagesApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // OnceReceptionUpdate
    onceReceptionUpdate: ...,
  } satisfies SetOnceMessageReceptionRequest;

  try {
    const data = await api.setOnceMessageReception(body);
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
| **onceReceptionUpdate** | [OnceReceptionUpdate](OnceReceptionUpdate.md) |  | |

### Return type

[**OnceStatus**](OnceStatus.md)

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
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

