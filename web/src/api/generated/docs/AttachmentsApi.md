# AttachmentsApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**createAttachmentReadAccess**](AttachmentsApi.md#createattachmentreadaccess) | **POST** /api/v1/spaces/{spaceId}/attachments/{attachmentId}/read-access | Create Attachment Read Access |
| [**createAttachmentUpload**](AttachmentsApi.md#createattachmentupload) | **POST** /api/v1/spaces/{spaceId}/attachments | Create Attachment Upload |
| [**deleteAttachment**](AttachmentsApi.md#deleteattachment) | **DELETE** /api/v1/spaces/{spaceId}/attachments/{attachmentId} | Delete Attachment |
| [**finalizeAttachmentUpload**](AttachmentsApi.md#finalizeattachmentupload) | **POST** /api/v1/spaces/{spaceId}/attachments/{attachmentId}/finalize | Finalize Attachment Upload |
| [**getAttachment**](AttachmentsApi.md#getattachment) | **GET** /api/v1/spaces/{spaceId}/attachments/{attachmentId} | Get Attachment |
| [**getAttachmentContent**](AttachmentsApi.md#getattachmentcontent) | **GET** /api/v1/spaces/{spaceId}/attachments/{attachmentId}/content | Get Attachment Content |
| [**uploadAttachmentContent**](AttachmentsApi.md#uploadattachmentcontent) | **PUT** /api/v1/spaces/{spaceId}/attachments/{attachmentId}/content | Upload Attachment Content |



## createAttachmentReadAccess

> ReadDescriptor createAttachmentReadAccess(attachmentId, spaceId, attachmentReadRequest)

Create Attachment Read Access

### Example

```ts
import {
  Configuration,
  AttachmentsApi,
} from '';
import type { CreateAttachmentReadAccessRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new AttachmentsApi();

  const body = {
    // string
    attachmentId: attachmentId_example,
    // string
    spaceId: spaceId_example,
    // AttachmentReadRequest
    attachmentReadRequest: ...,
  } satisfies CreateAttachmentReadAccessRequest;

  try {
    const data = await api.createAttachmentReadAccess(body);
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
| **attachmentId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **attachmentReadRequest** | [AttachmentReadRequest](AttachmentReadRequest.md) |  | |

### Return type

[**ReadDescriptor**](ReadDescriptor.md)

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

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## createAttachmentUpload

> UploadDescriptor createAttachmentUpload(spaceId, attachmentUploadCreate)

Create Attachment Upload

### Example

```ts
import {
  Configuration,
  AttachmentsApi,
} from '';
import type { CreateAttachmentUploadRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new AttachmentsApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // AttachmentUploadCreate
    attachmentUploadCreate: ...,
  } satisfies CreateAttachmentUploadRequest;

  try {
    const data = await api.createAttachmentUpload(body);
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
| **attachmentUploadCreate** | [AttachmentUploadCreate](AttachmentUploadCreate.md) |  | |

### Return type

[**UploadDescriptor**](UploadDescriptor.md)

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
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **413** | The content exceeds the server-side size limit. |  -  |
| **415** | The media type is not on the allowlist. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## deleteAttachment

> deleteAttachment(attachmentId, spaceId, ifMatch)

Delete Attachment

### Example

```ts
import {
  Configuration,
  AttachmentsApi,
} from '';
import type { DeleteAttachmentRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new AttachmentsApi();

  const body = {
    // string
    attachmentId: attachmentId_example,
    // string
    spaceId: spaceId_example,
    // string | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
  } satisfies DeleteAttachmentRequest;

  try {
    const data = await api.deleteAttachment(body);
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
| **attachmentId** | `string` |  | [Defaults to `undefined`] |
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
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## finalizeAttachmentUpload

> AttachmentDetail finalizeAttachmentUpload(attachmentId, spaceId, body)

Finalize Attachment Upload

### Example

```ts
import {
  Configuration,
  AttachmentsApi,
} from '';
import type { FinalizeAttachmentUploadRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new AttachmentsApi();

  const body = {
    // string
    attachmentId: attachmentId_example,
    // string
    spaceId: spaceId_example,
    // object
    body: Object,
  } satisfies FinalizeAttachmentUploadRequest;

  try {
    const data = await api.finalizeAttachmentUpload(body);
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
| **attachmentId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **body** | `object` |  | |

### Return type

[**AttachmentDetail**](AttachmentDetail.md)

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
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getAttachment

> AttachmentDetail getAttachment(attachmentId, spaceId)

Get Attachment

### Example

```ts
import {
  Configuration,
  AttachmentsApi,
} from '';
import type { GetAttachmentRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new AttachmentsApi();

  const body = {
    // string
    attachmentId: attachmentId_example,
    // string
    spaceId: spaceId_example,
  } satisfies GetAttachmentRequest;

  try {
    const data = await api.getAttachment(body);
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
| **attachmentId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**AttachmentDetail**](AttachmentDetail.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  * ETag -  <br>  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getAttachmentContent

> getAttachmentContent(attachmentId, spaceId, variant)

Get Attachment Content

Authorized streaming route (media pipeline, section 9).  Every access is verified immediately before opening the content. A previously issued &#x60;&#x60;ReadDescriptor&#x60;&#x60; is not an authorization credential: it does not shorten or replace this check.

### Example

```ts
import {
  Configuration,
  AttachmentsApi,
} from '';
import type { GetAttachmentContentRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new AttachmentsApi();

  const body = {
    // string
    attachmentId: attachmentId_example,
    // string
    spaceId: spaceId_example,
    // 'original' | 'thumbnail' (optional)
    variant: variant_example,
  } satisfies GetAttachmentContentRequest;

  try {
    const data = await api.getAttachmentContent(body);
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
| **attachmentId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **variant** | `original`, `thumbnail` |  | [Optional] [Defaults to `&#39;original&#39;`] [Enum: original, thumbnail] |

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
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## uploadAttachmentContent

> uploadAttachmentContent(attachmentId, spaceId)

Upload Attachment Content

Receive bytes through the server stream (M2-D13, local adapter).  Two operations intentionally happen in this order.  Authorization happens before reading. Otherwise an arbitrary sender could determine how much data the server accepts before upload authorization is known.  Reading is also bounded. &#x60;&#x60;await request.body()&#x60;&#x60; would buffer the entire body regardless of size, while the media pipeline explicitly forbids unbounded RAM buffering. Streaming therefore aborts at the first limit violation instead of measuring only after the full body is read.

### Example

```ts
import {
  Configuration,
  AttachmentsApi,
} from '';
import type { UploadAttachmentContentRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new AttachmentsApi();

  const body = {
    // string
    attachmentId: attachmentId_example,
    // string
    spaceId: spaceId_example,
  } satisfies UploadAttachmentContentRequest;

  try {
    const data = await api.uploadAttachmentContent(body);
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
| **attachmentId** | `string` |  | [Defaults to `undefined`] |
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
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **413** | The content exceeds the server-side size limit. |  -  |
| **415** | The media type is not on the allowlist. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

