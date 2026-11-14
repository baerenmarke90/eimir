# PartnerLocationApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**getPartnerDistance**](PartnerLocationApi.md#getpartnerdistance) | **POST** /api/v1/spaces/{spaceId}/partner-location/distance | Get Partner Distance |
| [**getPartnerLocationMap**](PartnerLocationApi.md#getpartnerlocationmap) | **GET** /api/v1/spaces/{spaceId}/partner-location/map | Get Partner Location Map |
| [**getPartnerLocationSettings**](PartnerLocationApi.md#getpartnerlocationsettings) | **GET** /api/v1/spaces/{spaceId}/partner-location/settings | Get Partner Location Settings |
| [**issuePartnerLocationDeviceCredential**](PartnerLocationApi.md#issuepartnerlocationdevicecredential) | **PUT** /api/v1/spaces/{spaceId}/partner-location/device-credential | Issue Partner Location Device Credential |
| [**publishPartnerLocationDeviceSnapshot**](PartnerLocationApi.md#publishpartnerlocationdevicesnapshot) | **PUT** /api/v1/partner-location/device-snapshot | Publish Partner Location Device Snapshot |
| [**publishPartnerLocationSnapshot**](PartnerLocationApi.md#publishpartnerlocationsnapshot) | **PUT** /api/v1/spaces/{spaceId}/partner-location/snapshot | Publish Partner Location Snapshot |
| [**revokePartnerLocationDeviceCredential**](PartnerLocationApi.md#revokepartnerlocationdevicecredential) | **DELETE** /api/v1/spaces/{spaceId}/partner-location/device-credential/{deviceId} | Revoke Partner Location Device Credential |
| [**updatePartnerLocationSettings**](PartnerLocationApi.md#updatepartnerlocationsettings) | **PUT** /api/v1/spaces/{spaceId}/partner-location/settings | Update Partner Location Settings |



## getPartnerDistance

> PartnerDistanceView getPartnerDistance(spaceId, presencePosition)

Get Partner Distance

Coarse distance band. The caller\&#39;s position is a transient input only.

### Example

```ts
import {
  Configuration,
  PartnerLocationApi,
} from '';
import type { GetPartnerDistanceRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PartnerLocationApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // PresencePosition
    presencePosition: ...,
  } satisfies GetPartnerDistanceRequest;

  try {
    const data = await api.getPartnerDistance(body);
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
| **presencePosition** | [PresencePosition](PresencePosition.md) |  | |

### Return type

[**PartnerDistanceView**](PartnerDistanceView.md)

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
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |
| **429** | Too many attempts occurred within the allowed time window. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getPartnerLocationMap

> PartnerMapView getPartnerLocationMap(spaceId)

Get Partner Location Map

Approximate partner area when the partner shares the map level.

### Example

```ts
import {
  Configuration,
  PartnerLocationApi,
} from '';
import type { GetPartnerLocationMapRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PartnerLocationApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies GetPartnerLocationMapRequest;

  try {
    const data = await api.getPartnerLocationMap(body);
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

[**PartnerMapView**](PartnerMapView.md)

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
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **429** | Too many attempts occurred within the allowed time window. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getPartnerLocationSettings

> PartnerLocationSettingsView getPartnerLocationSettings(spaceId)

Get Partner Location Settings

The caller\&#39;s own sharing state; readable without Premium.

### Example

```ts
import {
  Configuration,
  PartnerLocationApi,
} from '';
import type { GetPartnerLocationSettingsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PartnerLocationApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies GetPartnerLocationSettingsRequest;

  try {
    const data = await api.getPartnerLocationSettings(body);
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

[**PartnerLocationSettingsView**](PartnerLocationSettingsView.md)

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
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## issuePartnerLocationDeviceCredential

> PresenceDeviceCredentialView issuePartnerLocationDeviceCredential(spaceId, presenceDeviceCredentialRequest)

Issue Partner Location Device Credential

Issue this device\&#39;s background-upload credential for the caller\&#39;s active share.

### Example

```ts
import {
  Configuration,
  PartnerLocationApi,
} from '';
import type { IssuePartnerLocationDeviceCredentialRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PartnerLocationApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // PresenceDeviceCredentialRequest
    presenceDeviceCredentialRequest: ...,
  } satisfies IssuePartnerLocationDeviceCredentialRequest;

  try {
    const data = await api.issuePartnerLocationDeviceCredential(body);
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
| **presenceDeviceCredentialRequest** | [PresenceDeviceCredentialRequest](PresenceDeviceCredentialRequest.md) |  | |

### Return type

[**PresenceDeviceCredentialView**](PresenceDeviceCredentialView.md)

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
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## publishPartnerLocationDeviceSnapshot

> PresenceDevicePublishResult publishPartnerLocationDeviceSnapshot(presenceDevicePublish, authorization)

Publish Partner Location Device Snapshot

Background upload authorized only by a scoped presence device credential.

### Example

```ts
import {
  Configuration,
  PartnerLocationApi,
} from '';
import type { PublishPartnerLocationDeviceSnapshotRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PartnerLocationApi();

  const body = {
    // PresenceDevicePublish
    presenceDevicePublish: ...,
    // string | `Presence <credential>` from issuePartnerLocationDeviceCredential. (optional)
    authorization: authorization_example,
  } satisfies PublishPartnerLocationDeviceSnapshotRequest;

  try {
    const data = await api.publishPartnerLocationDeviceSnapshot(body);
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
| **presenceDevicePublish** | [PresenceDevicePublish](PresenceDevicePublish.md) |  | |
| **authorization** | `string` | &#x60;Presence &lt;credential&gt;&#x60; from issuePartnerLocationDeviceCredential. | [Optional] [Defaults to `undefined`] |

### Return type

[**PresenceDevicePublishResult**](PresenceDevicePublishResult.md)

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
| **422** | Request parameters or domain inputs are invalid. |  -  |
| **429** | Too many attempts occurred within the allowed time window. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## publishPartnerLocationSnapshot

> PartnerLocationSettingsView publishPartnerLocationSnapshot(spaceId, presencePublish)

Publish Partner Location Snapshot

Replace the caller\&#39;s snapped snapshot; returns the caller\&#39;s settings.

### Example

```ts
import {
  Configuration,
  PartnerLocationApi,
} from '';
import type { PublishPartnerLocationSnapshotRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PartnerLocationApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // PresencePublish
    presencePublish: ...,
  } satisfies PublishPartnerLocationSnapshotRequest;

  try {
    const data = await api.publishPartnerLocationSnapshot(body);
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
| **presencePublish** | [PresencePublish](PresencePublish.md) |  | |

### Return type

[**PartnerLocationSettingsView**](PartnerLocationSettingsView.md)

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
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |
| **429** | Too many attempts occurred within the allowed time window. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## revokePartnerLocationDeviceCredential

> revokePartnerLocationDeviceCredential(deviceId, spaceId)

Revoke Partner Location Device Credential

Stop background uploads from this device; never requires Premium.

### Example

```ts
import {
  Configuration,
  PartnerLocationApi,
} from '';
import type { RevokePartnerLocationDeviceCredentialRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PartnerLocationApi();

  const body = {
    // string
    deviceId: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    spaceId: spaceId_example,
  } satisfies RevokePartnerLocationDeviceCredentialRequest;

  try {
    const data = await api.revokePartnerLocationDeviceCredential(body);
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
| **deviceId** | `string` |  | [Defaults to `undefined`] |
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
| **204** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## updatePartnerLocationSettings

> PartnerLocationSettingsView updatePartnerLocationSettings(spaceId, partnerLocationSettingsUpdate)

Update Partner Location Settings

Start, change or stop sharing. &#x60;&#x60;OFF&#x60;&#x60; never requires Premium.

### Example

```ts
import {
  Configuration,
  PartnerLocationApi,
} from '';
import type { UpdatePartnerLocationSettingsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PartnerLocationApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // PartnerLocationSettingsUpdate
    partnerLocationSettingsUpdate: ...,
  } satisfies UpdatePartnerLocationSettingsRequest;

  try {
    const data = await api.updatePartnerLocationSettings(body);
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
| **partnerLocationSettingsUpdate** | [PartnerLocationSettingsUpdate](PartnerLocationSettingsUpdate.md) |  | |

### Return type

[**PartnerLocationSettingsView**](PartnerLocationSettingsView.md)

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
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

