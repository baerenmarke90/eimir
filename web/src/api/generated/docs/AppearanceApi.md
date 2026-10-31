# AppearanceApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**getAppIconPreference**](AppearanceApi.md#getappiconpreference) | **GET** /api/v1/spaces/{spaceId}/appearance/app-icon | Get App Icon Preference |
| [**getWirDesignPreference**](AppearanceApi.md#getwirdesignpreference) | **GET** /api/v1/spaces/{spaceId}/appearance/wir-design | Get Wir Design Preference |
| [**updateAppIconPreference**](AppearanceApi.md#updateappiconpreference) | **PATCH** /api/v1/spaces/{spaceId}/appearance/app-icon | Update App Icon Preference |
| [**updateWirDesignPreference**](AppearanceApi.md#updatewirdesignpreference) | **PATCH** /api/v1/spaces/{spaceId}/appearance/wir-design | Update Wir Design Preference |



## getAppIconPreference

> AppIconPreferenceView getAppIconPreference(spaceId)

Get App Icon Preference

Read/export only the caller\&#39;s selection, including after Pro expiry.

### Example

```ts
import {
  Configuration,
  AppearanceApi,
} from '';
import type { GetAppIconPreferenceRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new AppearanceApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies GetAppIconPreferenceRequest;

  try {
    const data = await api.getAppIconPreference(body);
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

[**AppIconPreferenceView**](AppIconPreferenceView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  * ETag - Opaque personal preference token; send unchanged as If-Match on writes. <br>  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getWirDesignPreference

> WirDesignPreferenceView getWirDesignPreference(spaceId)

Get Wir Design Preference

Read only the caller\&#39;s personal composition, including after Pro expiry.

### Example

```ts
import {
  Configuration,
  AppearanceApi,
} from '';
import type { GetWirDesignPreferenceRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new AppearanceApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies GetWirDesignPreferenceRequest;

  try {
    const data = await api.getWirDesignPreference(body);
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

[**WirDesignPreferenceView**](WirDesignPreferenceView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  * ETag - Opaque personal preference token; send unchanged as If-Match on writes. <br>  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## updateAppIconPreference

> AppIconPreferenceView updateAppIconPreference(spaceId, ifMatch, appIconPreferencePatch)

Update App Icon Preference

Save a known preset. Original is Free; each alternative requires Pro.  Membership precedes the capability check. Reads never delete or revert a previously saved cosmetic when a grant expires. No partner ID is accepted.

### Example

```ts
import {
  Configuration,
  AppearanceApi,
} from '';
import type { UpdateAppIconPreferenceRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new AppearanceApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // string | The last-read opaque resource state, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
    // AppIconPreferencePatch
    appIconPreferencePatch: ...,
  } satisfies UpdateAppIconPreferenceRequest;

  try {
    const data = await api.updateAppIconPreference(body);
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
| **ifMatch** | `string` | The last-read opaque resource state, encoded as a strong ETag. Writes are rejected without this header. | [Defaults to `undefined`] |
| **appIconPreferencePatch** | [AppIconPreferencePatch](AppIconPreferencePatch.md) |  | |

### Return type

[**AppIconPreferenceView**](AppIconPreferenceView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  * ETag - Opaque personal preference token; send unchanged as If-Match on writes. <br>  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## updateWirDesignPreference

> WirDesignPreferenceView updateWirDesignPreference(spaceId, ifMatch, wirDesignPreferencePatch)

Update Wir Design Preference

Save a personal cosmetic. Warm is Free; new alternatives require Pro.

### Example

```ts
import {
  Configuration,
  AppearanceApi,
} from '';
import type { UpdateWirDesignPreferenceRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new AppearanceApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // string | The last-read opaque resource state, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
    // WirDesignPreferencePatch
    wirDesignPreferencePatch: ...,
  } satisfies UpdateWirDesignPreferenceRequest;

  try {
    const data = await api.updateWirDesignPreference(body);
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
| **ifMatch** | `string` | The last-read opaque resource state, encoded as a strong ETag. Writes are rejected without this header. | [Defaults to `undefined`] |
| **wirDesignPreferencePatch** | [WirDesignPreferencePatch](WirDesignPreferencePatch.md) |  | |

### Return type

[**WirDesignPreferenceView**](WirDesignPreferenceView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  * ETag - Opaque personal preference token; send unchanged as If-Match on writes. <br>  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

