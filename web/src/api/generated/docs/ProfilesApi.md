# ProfilesApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**createProfilePreferenceApiV1SpacesSpaceIdProfilePreferencesPost**](ProfilesApi.md#createprofilepreferenceapiv1spacesspaceidprofilepreferencespost) | **POST** /api/v1/spaces/{spaceId}/profile-preferences | Create Profile Preference |
| [**deleteProfilePreferenceApiV1SpacesSpaceIdProfilePreferencesPreferenceIdDelete**](ProfilesApi.md#deleteprofilepreferenceapiv1spacesspaceidprofilepreferencespreferenceiddelete) | **DELETE** /api/v1/spaces/{spaceId}/profile-preferences/{preferenceId} | Delete Profile Preference |
| [**getPartnerNickname**](ProfilesApi.md#getpartnernickname) | **GET** /api/v1/spaces/{spaceId}/partner-nickname | Get Partner Nickname |
| [**getPartnerProfileApiV1SpacesSpaceIdProfilesAccountIdGet**](ProfilesApi.md#getpartnerprofileapiv1spacesspaceidprofilesaccountidget) | **GET** /api/v1/spaces/{spaceId}/profiles/{accountId} | Get Partner Profile |
| [**getProfileAvatarContent**](ProfilesApi.md#getprofileavatarcontent) | **GET** /api/v1/spaces/{spaceId}/profiles/{accountId}/avatar/content | Get Profile Avatar Content |
| [**getProfilePreferenceApiV1SpacesSpaceIdProfilePreferencesPreferenceIdGet**](ProfilesApi.md#getprofilepreferenceapiv1spacesspaceidprofilepreferencespreferenceidget) | **GET** /api/v1/spaces/{spaceId}/profile-preferences/{preferenceId} | Get Profile Preference |
| [**listProfilePreferencesApiV1SpacesSpaceIdProfilePreferencesGet**](ProfilesApi.md#listprofilepreferencesapiv1spacesspaceidprofilepreferencesget) | **GET** /api/v1/spaces/{spaceId}/profile-preferences | List Profile Preferences |
| [**setPartnerNickname**](ProfilesApi.md#setpartnernickname) | **PUT** /api/v1/spaces/{spaceId}/partner-nickname | Set Partner Nickname |
| [**updateProfileIdentity**](ProfilesApi.md#updateprofileidentity) | **PATCH** /api/v1/spaces/{spaceId}/profiles/{accountId} | Update Profile Identity |
| [**updateProfilePreferenceApiV1SpacesSpaceIdProfilePreferencesPreferenceIdPut**](ProfilesApi.md#updateprofilepreferenceapiv1spacesspaceidprofilepreferencespreferenceidput) | **PUT** /api/v1/spaces/{spaceId}/profile-preferences/{preferenceId} | Update Profile Preference |



## createProfilePreferenceApiV1SpacesSpaceIdProfilePreferencesPost

> ProfilePreferenceView createProfilePreferenceApiV1SpacesSpaceIdProfilePreferencesPost(spaceId, profilePreferenceCreate)

Create Profile Preference

### Example

```ts
import {
  Configuration,
  ProfilesApi,
} from '';
import type { CreateProfilePreferenceApiV1SpacesSpaceIdProfilePreferencesPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ProfilesApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // ProfilePreferenceCreate
    profilePreferenceCreate: ...,
  } satisfies CreateProfilePreferenceApiV1SpacesSpaceIdProfilePreferencesPostRequest;

  try {
    const data = await api.createProfilePreferenceApiV1SpacesSpaceIdProfilePreferencesPost(body);
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
| **profilePreferenceCreate** | [ProfilePreferenceCreate](ProfilePreferenceCreate.md) |  | |

### Return type

[**ProfilePreferenceView**](ProfilePreferenceView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **201** | Successful Response |  * ETag - Resource version to use for the next If-Match write request. <br>  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## deleteProfilePreferenceApiV1SpacesSpaceIdProfilePreferencesPreferenceIdDelete

> deleteProfilePreferenceApiV1SpacesSpaceIdProfilePreferencesPreferenceIdDelete(preferenceId, spaceId, ifMatch)

Delete Profile Preference

### Example

```ts
import {
  Configuration,
  ProfilesApi,
} from '';
import type { DeleteProfilePreferenceApiV1SpacesSpaceIdProfilePreferencesPreferenceIdDeleteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ProfilesApi();

  const body = {
    // string
    preferenceId: preferenceId_example,
    // string
    spaceId: spaceId_example,
    // string | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
  } satisfies DeleteProfilePreferenceApiV1SpacesSpaceIdProfilePreferencesPreferenceIdDeleteRequest;

  try {
    const data = await api.deleteProfilePreferenceApiV1SpacesSpaceIdProfilePreferencesPreferenceIdDelete(body);
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
| **preferenceId** | `string` |  | [Defaults to `undefined`] |
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


## getPartnerNickname

> PartnerNicknameView getPartnerNickname(spaceId)

Get Partner Nickname

### Example

```ts
import {
  Configuration,
  ProfilesApi,
} from '';
import type { GetPartnerNicknameRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ProfilesApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies GetPartnerNicknameRequest;

  try {
    const data = await api.getPartnerNickname(body);
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

[**PartnerNicknameView**](PartnerNicknameView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  * ETag - Resource version to use for the next If-Match write request. <br>  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getPartnerProfileApiV1SpacesSpaceIdProfilesAccountIdGet

> PartnerProfileView getPartnerProfileApiV1SpacesSpaceIdProfilesAccountIdGet(accountId, spaceId)

Get Partner Profile

### Example

```ts
import {
  Configuration,
  ProfilesApi,
} from '';
import type { GetPartnerProfileApiV1SpacesSpaceIdProfilesAccountIdGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ProfilesApi();

  const body = {
    // string
    accountId: accountId_example,
    // string
    spaceId: spaceId_example,
  } satisfies GetPartnerProfileApiV1SpacesSpaceIdProfilesAccountIdGetRequest;

  try {
    const data = await api.getPartnerProfileApiV1SpacesSpaceIdProfilesAccountIdGet(body);
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
| **accountId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**PartnerProfileView**](PartnerProfileView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  * ETag - Resource version to use for the next If-Match write request. <br>  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getProfileAvatarContent

> getProfileAvatarContent(accountId, spaceId)

Get Profile Avatar Content

Stream only the current avatar after current-Space profile authorization.  Avatar identity is Account-global while its backing Attachment remains Space-scoped. The caller therefore never supplies an arbitrary attachment ID here. We first prove that the subject has a readable profile in the caller\&#39;s current Space and only then resolve that Account\&#39;s one current avatar binding. This deliberately permits the same current avatar to appear in another Space where the same Account is an active member without making any other source-Space attachment readable.

### Example

```ts
import {
  Configuration,
  ProfilesApi,
} from '';
import type { GetProfileAvatarContentRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ProfilesApi();

  const body = {
    // string
    accountId: accountId_example,
    // string
    spaceId: spaceId_example,
  } satisfies GetProfileAvatarContentRequest;

  try {
    const data = await api.getProfileAvatarContent(body);
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
| **accountId** | `string` |  | [Defaults to `undefined`] |
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
| **200** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getProfilePreferenceApiV1SpacesSpaceIdProfilePreferencesPreferenceIdGet

> ProfilePreferenceView getProfilePreferenceApiV1SpacesSpaceIdProfilePreferencesPreferenceIdGet(preferenceId, spaceId)

Get Profile Preference

### Example

```ts
import {
  Configuration,
  ProfilesApi,
} from '';
import type { GetProfilePreferenceApiV1SpacesSpaceIdProfilePreferencesPreferenceIdGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ProfilesApi();

  const body = {
    // string
    preferenceId: preferenceId_example,
    // string
    spaceId: spaceId_example,
  } satisfies GetProfilePreferenceApiV1SpacesSpaceIdProfilePreferencesPreferenceIdGetRequest;

  try {
    const data = await api.getProfilePreferenceApiV1SpacesSpaceIdProfilePreferencesPreferenceIdGet(body);
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
| **preferenceId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**ProfilePreferenceView**](ProfilePreferenceView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  * ETag - Resource version to use for the next If-Match write request. <br>  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## listProfilePreferencesApiV1SpacesSpaceIdProfilePreferencesGet

> Array&lt;ProfilePreferenceView&gt; listProfilePreferencesApiV1SpacesSpaceIdProfilePreferencesGet(spaceId)

List Profile Preferences

### Example

```ts
import {
  Configuration,
  ProfilesApi,
} from '';
import type { ListProfilePreferencesApiV1SpacesSpaceIdProfilePreferencesGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ProfilesApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies ListProfilePreferencesApiV1SpacesSpaceIdProfilePreferencesGetRequest;

  try {
    const data = await api.listProfilePreferencesApiV1SpacesSpaceIdProfilePreferencesGet(body);
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

[**Array&lt;ProfilePreferenceView&gt;**](ProfilePreferenceView.md)

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


## setPartnerNickname

> PartnerNicknameView setPartnerNickname(spaceId, ifMatch, partnerNicknameUpdate)

Set Partner Nickname

### Example

```ts
import {
  Configuration,
  ProfilesApi,
} from '';
import type { SetPartnerNicknameRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ProfilesApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // string | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
    // PartnerNicknameUpdate
    partnerNicknameUpdate: ...,
  } satisfies SetPartnerNicknameRequest;

  try {
    const data = await api.setPartnerNickname(body);
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
| **ifMatch** | `string` | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header. | [Defaults to `undefined`] |
| **partnerNicknameUpdate** | [PartnerNicknameUpdate](PartnerNicknameUpdate.md) |  | |

### Return type

[**PartnerNicknameView**](PartnerNicknameView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  * ETag - Resource version to use for the next If-Match write request. <br>  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## updateProfileIdentity

> PartnerProfileView updateProfileIdentity(accountId, spaceId, ifMatch, profileIdentityUpdate)

Update Profile Identity

Change only the authenticated account\&#39;s current presentation identity.

### Example

```ts
import {
  Configuration,
  ProfilesApi,
} from '';
import type { UpdateProfileIdentityRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ProfilesApi();

  const body = {
    // string
    accountId: accountId_example,
    // string
    spaceId: spaceId_example,
    // string | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
    // ProfileIdentityUpdate
    profileIdentityUpdate: ...,
  } satisfies UpdateProfileIdentityRequest;

  try {
    const data = await api.updateProfileIdentity(body);
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
| **accountId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **ifMatch** | `string` | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header. | [Defaults to `undefined`] |
| **profileIdentityUpdate** | [ProfileIdentityUpdate](ProfileIdentityUpdate.md) |  | |

### Return type

[**PartnerProfileView**](PartnerProfileView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  * ETag - Resource version to use for the next If-Match write request. <br>  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## updateProfilePreferenceApiV1SpacesSpaceIdProfilePreferencesPreferenceIdPut

> ProfilePreferenceView updateProfilePreferenceApiV1SpacesSpaceIdProfilePreferencesPreferenceIdPut(preferenceId, spaceId, ifMatch, profilePreferenceUpdate)

Update Profile Preference

### Example

```ts
import {
  Configuration,
  ProfilesApi,
} from '';
import type { UpdateProfilePreferenceApiV1SpacesSpaceIdProfilePreferencesPreferenceIdPutRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ProfilesApi();

  const body = {
    // string
    preferenceId: preferenceId_example,
    // string
    spaceId: spaceId_example,
    // string | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
    // ProfilePreferenceUpdate
    profilePreferenceUpdate: ...,
  } satisfies UpdateProfilePreferenceApiV1SpacesSpaceIdProfilePreferencesPreferenceIdPutRequest;

  try {
    const data = await api.updateProfilePreferenceApiV1SpacesSpaceIdProfilePreferencesPreferenceIdPut(body);
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
| **preferenceId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **ifMatch** | `string` | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header. | [Defaults to `undefined`] |
| **profilePreferenceUpdate** | [ProfilePreferenceUpdate](ProfilePreferenceUpdate.md) |  | |

### Return type

[**ProfilePreferenceView**](ProfilePreferenceView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  * ETag - Resource version to use for the next If-Match write request. <br>  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

