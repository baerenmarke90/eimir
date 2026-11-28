# AppearanceApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**getAppIconPreference**](AppearanceApi.md#getappiconpreference) | **GET** /api/v1/spaces/{spaceId}/appearance/app-icon | Get App Icon Preference |
| [**getMemoryWorldPreference**](AppearanceApi.md#getmemoryworldpreference) | **GET** /api/v1/spaces/{spaceId}/appearance/memory-world | Get Memory World Preference |
| [**getPersonColoursPreference**](AppearanceApi.md#getpersoncolourspreference) | **GET** /api/v1/spaces/{spaceId}/appearance/person-colours | Get Person Colours Preference |
| [**getWirDesignPreference**](AppearanceApi.md#getwirdesignpreference) | **GET** /api/v1/spaces/{spaceId}/appearance/wir-design | Get Wir Design Preference |
| [**getWirReelStylePreference**](AppearanceApi.md#getwirreelstylepreference) | **GET** /api/v1/spaces/{spaceId}/appearance/wir-reels | Get Wir Reel Style Preference |
| [**updateAppIconPreference**](AppearanceApi.md#updateappiconpreference) | **PATCH** /api/v1/spaces/{spaceId}/appearance/app-icon | Update App Icon Preference |
| [**updateMemoryWorldPreference**](AppearanceApi.md#updatememoryworldpreference) | **PATCH** /api/v1/spaces/{spaceId}/appearance/memory-world | Update Memory World Preference |
| [**updatePersonColoursPreference**](AppearanceApi.md#updatepersoncolourspreference) | **PATCH** /api/v1/spaces/{spaceId}/appearance/person-colours | Update Person Colours Preference |
| [**updateWirDesignPreference**](AppearanceApi.md#updatewirdesignpreference) | **PATCH** /api/v1/spaces/{spaceId}/appearance/wir-design | Update Wir Design Preference |
| [**updateWirReelStylePreference**](AppearanceApi.md#updatewirreelstylepreference) | **PATCH** /api/v1/spaces/{spaceId}/appearance/wir-reels | Update Wir Reel Style Preference |



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


## getMemoryWorldPreference

> MemoryWorldPreferenceView getMemoryWorldPreference(spaceId)

Get Memory World Preference

Read only the caller\&#39;s own memory world, including after Pro expiry.

### Example

```ts
import {
  Configuration,
  AppearanceApi,
} from '';
import type { GetMemoryWorldPreferenceRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new AppearanceApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies GetMemoryWorldPreferenceRequest;

  try {
    const data = await api.getMemoryWorldPreference(body);
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

[**MemoryWorldPreferenceView**](MemoryWorldPreferenceView.md)

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


## getPersonColoursPreference

> PersonColoursPreferenceView getPersonColoursPreference(spaceId)

Get Person Colours Preference

Read only the caller\&#39;s own colour pair. No partner value is ever returned.

### Example

```ts
import {
  Configuration,
  AppearanceApi,
} from '';
import type { GetPersonColoursPreferenceRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new AppearanceApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies GetPersonColoursPreferenceRequest;

  try {
    const data = await api.getPersonColoursPreference(body);
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

[**PersonColoursPreferenceView**](PersonColoursPreferenceView.md)

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


## getWirReelStylePreference

> WirReelStylePreferenceView getWirReelStylePreference(spaceId)

Get Wir Reel Style Preference

Read only the caller\&#39;s own Wir reel style, including after Pro expiry.

### Example

```ts
import {
  Configuration,
  AppearanceApi,
} from '';
import type { GetWirReelStylePreferenceRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new AppearanceApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies GetWirReelStylePreferenceRequest;

  try {
    const data = await api.getWirReelStylePreference(body);
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

[**WirReelStylePreferenceView**](WirReelStylePreferenceView.md)

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


## updateMemoryWorldPreference

> MemoryWorldPreferenceView updateMemoryWorldPreference(spaceId, ifMatch, memoryWorldPreferencePatch)

Update Memory World Preference

Save a known world. Story and Stapel are Free; every other world requires Pro.  Membership precedes the capability check. Reads never delete or revert a saved world when a grant expires, and returning to a Free world stays free. The world is a personal presentation and is not shared with the partner.

### Example

```ts
import {
  Configuration,
  AppearanceApi,
} from '';
import type { UpdateMemoryWorldPreferenceRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new AppearanceApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // string | The last-read opaque resource state, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
    // MemoryWorldPreferencePatch
    memoryWorldPreferencePatch: ...,
  } satisfies UpdateMemoryWorldPreferenceRequest;

  try {
    const data = await api.updateMemoryWorldPreference(body);
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
| **memoryWorldPreferencePatch** | [MemoryWorldPreferencePatch](MemoryWorldPreferencePatch.md) |  | |

### Return type

[**MemoryWorldPreferenceView**](MemoryWorldPreferenceView.md)

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


## updatePersonColoursPreference

> PersonColoursPreferenceView updatePersonColoursPreference(spaceId, ifMatch, personColoursPreferencePatch)

Update Person Colours Preference

Save a known colour pair (Pro) or return to automatic (always Free).  Membership precedes the capability check. Reads never delete or revert a saved pair when a grant expires, and going back to automatic stays free. The pair is a personal view of the people in this Space. It is not shared and carries no gender statement.

### Example

```ts
import {
  Configuration,
  AppearanceApi,
} from '';
import type { UpdatePersonColoursPreferenceRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new AppearanceApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // string | The last-read opaque resource state, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
    // PersonColoursPreferencePatch
    personColoursPreferencePatch: ...,
  } satisfies UpdatePersonColoursPreferenceRequest;

  try {
    const data = await api.updatePersonColoursPreference(body);
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
| **personColoursPreferencePatch** | [PersonColoursPreferencePatch](PersonColoursPreferencePatch.md) |  | |

### Return type

[**PersonColoursPreferenceView**](PersonColoursPreferenceView.md)

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

Save personal design choices. Following the design and Free palettes never need Pro.

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


## updateWirReelStylePreference

> WirReelStylePreferenceView updateWirReelStylePreference(spaceId, ifMatch, wirReelStylePreferencePatch)

Update Wir Reel Style Preference

Save a known style. Circles are Free; tiles and chips require Pro.  Membership precedes the capability check. Reads never delete or revert a saved style when a grant expires, and returning to circles stays free. The style is a personal presentation and is not shared with the partner.

### Example

```ts
import {
  Configuration,
  AppearanceApi,
} from '';
import type { UpdateWirReelStylePreferenceRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new AppearanceApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // string | The last-read opaque resource state, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
    // WirReelStylePreferencePatch
    wirReelStylePreferencePatch: ...,
  } satisfies UpdateWirReelStylePreferenceRequest;

  try {
    const data = await api.updateWirReelStylePreference(body);
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
| **wirReelStylePreferencePatch** | [WirReelStylePreferencePatch](WirReelStylePreferencePatch.md) |  | |

### Return type

[**WirReelStylePreferenceView**](WirReelStylePreferenceView.md)

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

