# AccountApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**deleteOwnAccountApiV1AccountDeletionPost**](AccountApi.md#deleteownaccountapiv1accountdeletionpost) | **POST** /api/v1/account/deletion | Delete the authenticated Account |
| [**getPhotoLocationPreference**](AccountApi.md#getphotolocationpreference) | **GET** /api/v1/account/photo-location-preference | Get Photo Location Preference |
| [**setPhotoLocationPreference**](AccountApi.md#setphotolocationpreference) | **PUT** /api/v1/account/photo-location-preference | Set Photo Location Preference |



## deleteOwnAccountApiV1AccountDeletionPost

> AccountDeletionAccepted deleteOwnAccountApiV1AccountDeletionPost(accountDeletionRequest)

Delete the authenticated Account

Accept deletion only after confirmation and recent authentication.  The confirmation literal prevents accidental UI activation; it is not an authentication factor. A separate server-side recent-authentication grant must therefore authorize this exact Account, DeviceSession, and deletion purpose before the existing irreversible deletion pipeline is entered.  No Account identifier or recent-auth proof is accepted from the client, so neither cross-account deletion nor client-forged step-up state is possible. Once the external tombstone and fail-closed state commit, cleanup continues through the existing worker even if the client disconnects.

### Example

```ts
import {
  Configuration,
  AccountApi,
} from '';
import type { DeleteOwnAccountApiV1AccountDeletionPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new AccountApi();

  const body = {
    // AccountDeletionRequest
    accountDeletionRequest: ...,
  } satisfies DeleteOwnAccountApiV1AccountDeletionPostRequest;

  try {
    const data = await api.deleteOwnAccountApiV1AccountDeletionPost(body);
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
| **accountDeletionRequest** | [AccountDeletionRequest](AccountDeletionRequest.md) |  | |

### Return type

[**AccountDeletionAccepted**](AccountDeletionAccepted.md)

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
| **422** | Request parameters or domain inputs are invalid. |  -  |
| **503** | A capability required for this operation is not configured on this instance. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getPhotoLocationPreference

> PhotoLocationPreference getPhotoLocationPreference()

Get Photo Location Preference

### Example

```ts
import {
  Configuration,
  AccountApi,
} from '';
import type { GetPhotoLocationPreferenceRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new AccountApi();

  try {
    const data = await api.getPhotoLocationPreference();
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

[**PhotoLocationPreference**](PhotoLocationPreference.md)

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

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## setPhotoLocationPreference

> PhotoLocationPreference setPhotoLocationPreference(ifMatch, photoLocationPreferenceUpdate)

Set Photo Location Preference

### Example

```ts
import {
  Configuration,
  AccountApi,
} from '';
import type { SetPhotoLocationPreferenceRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new AccountApi();

  const body = {
    // string | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
    // PhotoLocationPreferenceUpdate
    photoLocationPreferenceUpdate: ...,
  } satisfies SetPhotoLocationPreferenceRequest;

  try {
    const data = await api.setPhotoLocationPreference(body);
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
| **ifMatch** | `string` | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header. | [Defaults to `undefined`] |
| **photoLocationPreferenceUpdate** | [PhotoLocationPreferenceUpdate](PhotoLocationPreferenceUpdate.md) |  | |

### Return type

[**PhotoLocationPreference**](PhotoLocationPreference.md)

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

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

