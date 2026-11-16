# SharedNotesApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**createSharedNote**](SharedNotesApi.md#createsharednote) | **POST** /api/v1/spaces/{spaceId}/shared-notes | Create Shared Note |
| [**deleteSharedNote**](SharedNotesApi.md#deletesharednote) | **DELETE** /api/v1/spaces/{spaceId}/shared-notes/{sharedNoteId} | Delete Shared Note |
| [**getSharedNote**](SharedNotesApi.md#getsharednote) | **GET** /api/v1/spaces/{spaceId}/shared-notes/{sharedNoteId} | Get Shared Note |
| [**listSharedNotes**](SharedNotesApi.md#listsharednotes) | **GET** /api/v1/spaces/{spaceId}/shared-notes | List Shared Notes |
| [**setSharedNotePresentation**](SharedNotesApi.md#setsharednotepresentation) | **PUT** /api/v1/spaces/{spaceId}/shared-notes/{sharedNoteId}/presentation | Set Shared Note Presentation |
| [**updateSharedNote**](SharedNotesApi.md#updatesharednote) | **PATCH** /api/v1/spaces/{spaceId}/shared-notes/{sharedNoteId} | Update Shared Note |



## createSharedNote

> SharedNoteDetail createSharedNote(spaceId, sharedNoteCreate)

Create Shared Note

### Example

```ts
import {
  Configuration,
  SharedNotesApi,
} from '';
import type { CreateSharedNoteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new SharedNotesApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // SharedNoteCreate
    sharedNoteCreate: ...,
  } satisfies CreateSharedNoteRequest;

  try {
    const data = await api.createSharedNote(body);
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
| **sharedNoteCreate** | [SharedNoteCreate](SharedNoteCreate.md) |  | |

### Return type

[**SharedNoteDetail**](SharedNoteDetail.md)

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


## deleteSharedNote

> deleteSharedNote(sharedNoteId, spaceId, ifMatch)

Delete Shared Note

### Example

```ts
import {
  Configuration,
  SharedNotesApi,
} from '';
import type { DeleteSharedNoteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new SharedNotesApi();

  const body = {
    // string
    sharedNoteId: sharedNoteId_example,
    // string
    spaceId: spaceId_example,
    // string | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
  } satisfies DeleteSharedNoteRequest;

  try {
    const data = await api.deleteSharedNote(body);
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
| **sharedNoteId** | `string` |  | [Defaults to `undefined`] |
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


## getSharedNote

> SharedNoteDetail getSharedNote(sharedNoteId, spaceId)

Get Shared Note

### Example

```ts
import {
  Configuration,
  SharedNotesApi,
} from '';
import type { GetSharedNoteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new SharedNotesApi();

  const body = {
    // string
    sharedNoteId: sharedNoteId_example,
    // string
    spaceId: spaceId_example,
  } satisfies GetSharedNoteRequest;

  try {
    const data = await api.getSharedNote(body);
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
| **sharedNoteId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**SharedNoteDetail**](SharedNoteDetail.md)

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


## listSharedNotes

> SharedNotePage listSharedNotes(spaceId, cursor, limit, pinned, ids)

List Shared Notes

### Example

```ts
import {
  Configuration,
  SharedNotesApi,
} from '';
import type { ListSharedNotesRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new SharedNotesApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // string (optional)
    cursor: cursor_example,
    // number (optional)
    limit: 56,
    // boolean | Return only pinned (true) or only unpinned (false) notes. (optional)
    pinned: true,
    // Array<string> | Return only these notes, so several known notes need one request. (optional)
    ids: ...,
  } satisfies ListSharedNotesRequest;

  try {
    const data = await api.listSharedNotes(body);
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
| **pinned** | `boolean` | Return only pinned (true) or only unpinned (false) notes. | [Optional] [Defaults to `undefined`] |
| **ids** | `Array<string>` | Return only these notes, so several known notes need one request. | [Optional] |

### Return type

[**SharedNotePage**](SharedNotePage.md)

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


## setSharedNotePresentation

> SharedNoteDetail setSharedNotePresentation(sharedNoteId, spaceId, sharedNotePresentation)

Set Shared Note Presentation

### Example

```ts
import {
  Configuration,
  SharedNotesApi,
} from '';
import type { SetSharedNotePresentationRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new SharedNotesApi();

  const body = {
    // string
    sharedNoteId: sharedNoteId_example,
    // string
    spaceId: spaceId_example,
    // SharedNotePresentation
    sharedNotePresentation: ...,
  } satisfies SetSharedNotePresentationRequest;

  try {
    const data = await api.setSharedNotePresentation(body);
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
| **sharedNoteId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **sharedNotePresentation** | [SharedNotePresentation](SharedNotePresentation.md) |  | |

### Return type

[**SharedNoteDetail**](SharedNoteDetail.md)

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
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## updateSharedNote

> SharedNoteDetail updateSharedNote(sharedNoteId, spaceId, ifMatch, sharedNoteUpdate)

Update Shared Note

### Example

```ts
import {
  Configuration,
  SharedNotesApi,
} from '';
import type { UpdateSharedNoteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new SharedNotesApi();

  const body = {
    // string
    sharedNoteId: sharedNoteId_example,
    // string
    spaceId: spaceId_example,
    // string | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
    // SharedNoteUpdate
    sharedNoteUpdate: ...,
  } satisfies UpdateSharedNoteRequest;

  try {
    const data = await api.updateSharedNote(body);
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
| **sharedNoteId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **ifMatch** | `string` | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header. | [Defaults to `undefined`] |
| **sharedNoteUpdate** | [SharedNoteUpdate](SharedNoteUpdate.md) |  | |

### Return type

[**SharedNoteDetail**](SharedNoteDetail.md)

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

