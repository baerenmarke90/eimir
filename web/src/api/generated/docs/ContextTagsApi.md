# ContextTagsApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**getContextTagSuggestions**](ContextTagsApi.md#getcontexttagsuggestions) | **GET** /api/v1/spaces/{spaceId}/context-tag-suggestions | Get Context Tag Suggestions |



## getContextTagSuggestions

> ContextTagSuggestionsView getContextTagSuggestions(spaceId, parentType, parentId, sharedOnly)

Get Context Tag Suggestions

### Example

```ts
import {
  Configuration,
  ContextTagsApi,
} from '';
import type { GetContextTagSuggestionsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ContextTagsApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // 'MEMORY' | 'HEART_MOMENT' | 'PLAN' | 'WISH' (optional)
    parentType: parentType_example,
    // string (optional)
    parentId: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // boolean (optional)
    sharedOnly: true,
  } satisfies GetContextTagSuggestionsRequest;

  try {
    const data = await api.getContextTagSuggestions(body);
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
| **parentType** | `MEMORY`, `HEART_MOMENT`, `PLAN`, `WISH` |  | [Optional] [Defaults to `undefined`] [Enum: MEMORY, HEART_MOMENT, PLAN, WISH] |
| **parentId** | `string` |  | [Optional] [Defaults to `undefined`] |
| **sharedOnly** | `boolean` |  | [Optional] [Defaults to `false`] |

### Return type

[**ContextTagSuggestionsView**](ContextTagSuggestionsView.md)

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

