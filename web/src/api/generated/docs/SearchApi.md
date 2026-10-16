# SearchApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**searchSpaceContent**](SearchApi.md#searchspacecontent) | **GET** /api/v1/spaces/{spaceId}/search | Search Space Content |



## searchSpaceContent

> SearchPage searchSpaceContent(spaceId, q, type, cursor, limit)

Search Space Content

Search shared Space content plus the caller\&#39;s own private content.

### Example

```ts
import {
  Configuration,
  SearchApi,
} from '';
import type { SearchSpaceContentRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new SearchApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // string
    q: q_example,
    // Array<SearchKind> (optional)
    type: ...,
    // string (optional)
    cursor: cursor_example,
    // number (optional)
    limit: 56,
  } satisfies SearchSpaceContentRequest;

  try {
    const data = await api.searchSpaceContent(body);
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
| **q** | `string` |  | [Defaults to `undefined`] |
| **type** | `Array<SearchKind>` |  | [Optional] |
| **cursor** | `string` |  | [Optional] [Defaults to `undefined`] |
| **limit** | `number` |  | [Optional] [Defaults to `25`] |

### Return type

[**SearchPage**](SearchPage.md)

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

