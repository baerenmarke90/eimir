# EntitlementsApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**getSpaceEntitlementsApiV1SpacesSpaceIdEntitlementsGet**](EntitlementsApi.md#getspaceentitlementsapiv1spacesspaceidentitlementsget) | **GET** /api/v1/spaces/{spaceId}/entitlements | Get Space Entitlements |



## getSpaceEntitlementsApiV1SpacesSpaceIdEntitlementsGet

> SpaceEntitlementView getSpaceEntitlementsApiV1SpacesSpaceIdEntitlementsGet(spaceId)

Get Space Entitlements

Return the effective commercial capability entitlement state for the Space.

### Example

```ts
import {
  Configuration,
  EntitlementsApi,
} from '';
import type { GetSpaceEntitlementsApiV1SpacesSpaceIdEntitlementsGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new EntitlementsApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies GetSpaceEntitlementsApiV1SpacesSpaceIdEntitlementsGetRequest;

  try {
    const data = await api.getSpaceEntitlementsApiV1SpacesSpaceIdEntitlementsGet(body);
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

[**SpaceEntitlementView**](SpaceEntitlementView.md)

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

