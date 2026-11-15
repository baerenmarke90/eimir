# LinkPreviewsApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**resolveLinkPreview**](LinkPreviewsApi.md#resolvelinkpreview) | **POST** /api/v1/spaces/{spaceId}/link-preview | Resolve Link Preview |



## resolveLinkPreview

> LinkPreviewResult resolveLinkPreview(spaceId, linkPreviewRequest)

Resolve Link Preview

Resolve only after an explicit preview action; never persist target content.

### Example

```ts
import {
  Configuration,
  LinkPreviewsApi,
} from '';
import type { ResolveLinkPreviewRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new LinkPreviewsApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // LinkPreviewRequest
    linkPreviewRequest: ...,
  } satisfies ResolveLinkPreviewRequest;

  try {
    const data = await api.resolveLinkPreview(body);
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
| **linkPreviewRequest** | [LinkPreviewRequest](LinkPreviewRequest.md) |  | |

### Return type

[**LinkPreviewResult**](LinkPreviewResult.md)

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
| **429** | Too many attempts occurred within the allowed time window. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

