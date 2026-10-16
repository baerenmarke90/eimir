# InstanceApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**instanceStatusApiV1InstanceStatusGet**](InstanceApi.md#instancestatusapiv1instancestatusget) | **GET** /api/v1/instance/status | Instance Status |



## instanceStatusApiV1InstanceStatusGet

> InstanceAccessStatus instanceStatusApiV1InstanceStatusGet()

Instance Status

Return the minimum public state required by login/onboarding clients.

### Example

```ts
import {
  Configuration,
  InstanceApi,
} from '';
import type { InstanceStatusApiV1InstanceStatusGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new InstanceApi();

  try {
    const data = await api.instanceStatusApiV1InstanceStatusGet();
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

[**InstanceAccessStatus**](InstanceAccessStatus.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

