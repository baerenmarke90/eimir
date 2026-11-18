# PersonalSettingsApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**getAccountPersonalSettings**](PersonalSettingsApi.md#getaccountpersonalsettings) | **GET** /api/v1/account/personal-settings | Get Account Personal Settings |
| [**getSpacePersonalSettings**](PersonalSettingsApi.md#getspacepersonalsettings) | **GET** /api/v1/spaces/{spaceId}/personal-settings | Get Space Personal Settings |
| [**updateAccountPersonalSettings**](PersonalSettingsApi.md#updateaccountpersonalsettings) | **PATCH** /api/v1/account/personal-settings | Update Account Personal Settings |
| [**updateSpacePersonalSettings**](PersonalSettingsApi.md#updatespacepersonalsettings) | **PATCH** /api/v1/spaces/{spaceId}/personal-settings | Update Space Personal Settings |



## getAccountPersonalSettings

> AccountPersonalSettingsView getAccountPersonalSettings()

Get Account Personal Settings

Read only the caller\&#39;s Account-wide choices. A read never creates a row.

### Example

```ts
import {
  Configuration,
  PersonalSettingsApi,
} from '';
import type { GetAccountPersonalSettingsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PersonalSettingsApi();

  try {
    const data = await api.getAccountPersonalSettings();
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

[**AccountPersonalSettingsView**](AccountPersonalSettingsView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  * ETag - Opaque personal settings token; send unchanged as If-Match on writes. <br>  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getSpacePersonalSettings

> SpacePersonalSettingsView getSpacePersonalSettings(spaceId)

Get Space Personal Settings

Read only the caller\&#39;s own choices in this Space, never the partner\&#39;s.

### Example

```ts
import {
  Configuration,
  PersonalSettingsApi,
} from '';
import type { GetSpacePersonalSettingsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PersonalSettingsApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies GetSpacePersonalSettingsRequest;

  try {
    const data = await api.getSpacePersonalSettings(body);
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

[**SpacePersonalSettingsView**](SpacePersonalSettingsView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  * ETag - Opaque personal settings token; send unchanged as If-Match on writes. <br>  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## updateAccountPersonalSettings

> AccountPersonalSettingsView updateAccountPersonalSettings(ifMatch, accountPersonalSettingsPatch)

Update Account Personal Settings

Merge the changed keys into the caller\&#39;s Account-wide document.

### Example

```ts
import {
  Configuration,
  PersonalSettingsApi,
} from '';
import type { UpdateAccountPersonalSettingsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PersonalSettingsApi();

  const body = {
    // string | The last-read opaque resource state, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
    // AccountPersonalSettingsPatch
    accountPersonalSettingsPatch: ...,
  } satisfies UpdateAccountPersonalSettingsRequest;

  try {
    const data = await api.updateAccountPersonalSettings(body);
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
| **ifMatch** | `string` | The last-read opaque resource state, encoded as a strong ETag. Writes are rejected without this header. | [Defaults to `undefined`] |
| **accountPersonalSettingsPatch** | [AccountPersonalSettingsPatch](AccountPersonalSettingsPatch.md) |  | |

### Return type

[**AccountPersonalSettingsView**](AccountPersonalSettingsView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  * ETag - Opaque personal settings token; send unchanged as If-Match on writes. <br>  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## updateSpacePersonalSettings

> SpacePersonalSettingsView updateSpacePersonalSettings(spaceId, ifMatch, spacePersonalSettingsPatch)

Update Space Personal Settings

Merge the changed keys into the caller\&#39;s document for this Space.

### Example

```ts
import {
  Configuration,
  PersonalSettingsApi,
} from '';
import type { UpdateSpacePersonalSettingsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PersonalSettingsApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // string | The last-read opaque resource state, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
    // SpacePersonalSettingsPatch
    spacePersonalSettingsPatch: ...,
  } satisfies UpdateSpacePersonalSettingsRequest;

  try {
    const data = await api.updateSpacePersonalSettings(body);
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
| **spacePersonalSettingsPatch** | [SpacePersonalSettingsPatch](SpacePersonalSettingsPatch.md) |  | |

### Return type

[**SpacePersonalSettingsView**](SpacePersonalSettingsView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  * ETag - Opaque personal settings token; send unchanged as If-Match on writes. <br>  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

