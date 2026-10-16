# ServerAdminApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**deleteServerAdminAccountApiV1ServerAdminAccountsAccountIdDeletionPost**](ServerAdminApi.md#deleteserveradminaccountapiv1serveradminaccountsaccountiddeletionpost) | **POST** /api/v1/server-admin/accounts/{accountId}/deletion | Delete Server Admin Account |
| [**getServerAdminAccountApiV1ServerAdminAccountsAccountIdGet**](ServerAdminApi.md#getserveradminaccountapiv1serveradminaccountsaccountidget) | **GET** /api/v1/server-admin/accounts/{accountId} | Get Server Admin Account |
| [**getServerAdminActionActivityApiV1ServerAdminActivityActionsGet**](ServerAdminApi.md#getserveradminactionactivityapiv1serveradminactivityactionsget) | **GET** /api/v1/server-admin/activity/actions | Get Server Admin Action Activity |
| [**getServerAdminActivityApiV1ServerAdminActivityGet**](ServerAdminApi.md#getserveradminactivityapiv1serveradminactivityget) | **GET** /api/v1/server-admin/activity | Get Server Admin Activity |
| [**getServerAdminOverviewApiV1ServerAdminOverviewGet**](ServerAdminApi.md#getserveradminoverviewapiv1serveradminoverviewget) | **GET** /api/v1/server-admin/overview | Get Server Admin Overview |
| [**getServerAdminPrivilegedActivityApiV1ServerAdminActivityPrivilegedGet**](ServerAdminApi.md#getserveradminprivilegedactivityapiv1serveradminactivityprivilegedget) | **GET** /api/v1/server-admin/activity/privileged | Get Server Admin Privileged Activity |
| [**getServerAdminSettingsApiV1ServerAdminSettingsGet**](ServerAdminApi.md#getserveradminsettingsapiv1serveradminsettingsget) | **GET** /api/v1/server-admin/settings | Get Server Admin Settings |
| [**getServerAdminSpaceApiV1ServerAdminSpacesSpaceIdGet**](ServerAdminApi.md#getserveradminspaceapiv1serveradminspacesspaceidget) | **GET** /api/v1/server-admin/spaces/{space_id} | Get Server Admin Space |
| [**getServerAdminSpaceEntitlementApiV1ServerAdminSpacesSpaceIdEntitlementGet**](ServerAdminApi.md#getserveradminspaceentitlementapiv1serveradminspacesspaceidentitlementget) | **GET** /api/v1/server-admin/spaces/{space_id}/entitlement | Get Server Admin Space Entitlement |
| [**getServerAdminStorageApiV1ServerAdminStorageGet**](ServerAdminApi.md#getserveradminstorageapiv1serveradminstorageget) | **GET** /api/v1/server-admin/storage | Get Server Admin Storage |
| [**grantServerAdminSpaceEntitlementApiV1ServerAdminSpacesSpaceIdEntitlementGrantsPost**](ServerAdminApi.md#grantserveradminspaceentitlementapiv1serveradminspacesspaceidentitlementgrantspost) | **POST** /api/v1/server-admin/spaces/{space_id}/entitlement/grants | Grant Server Admin Space Entitlement |
| [**issueServerAdminOperatorRecoveryApiV1ServerAdminAccountsAccountIdRecoveryOperatorPost**](ServerAdminApi.md#issueserveradminoperatorrecoveryapiv1serveradminaccountsaccountidrecoveryoperatorpost) | **POST** /api/v1/server-admin/accounts/{accountId}/recovery/operator | Issue Server Admin Operator Recovery |
| [**listServerAdminAccountsApiV1ServerAdminAccountsGet**](ServerAdminApi.md#listserveradminaccountsapiv1serveradminaccountsget) | **GET** /api/v1/server-admin/accounts | List Server Admin Accounts |
| [**listServerAdminJobsApiV1ServerAdminJobsGet**](ServerAdminApi.md#listserveradminjobsapiv1serveradminjobsget) | **GET** /api/v1/server-admin/jobs | List Server Admin Jobs |
| [**listServerAdminSpacesApiV1ServerAdminSpacesGet**](ServerAdminApi.md#listserveradminspacesapiv1serveradminspacesget) | **GET** /api/v1/server-admin/spaces | List Server Admin Spaces |
| [**reconcileServerAdminSpaceConfigurationManager**](ServerAdminApi.md#reconcileserveradminspaceconfigurationmanager) | **POST** /api/v1/server-admin/spaces/{space_id}/configuration-manager/reconcile | Reconcile Server Admin Space Configuration Manager |
| [**requestServerAdminAccountEmailVerificationApiV1ServerAdminAccountsAccountIdEmailVerificationRequestPost**](ServerAdminApi.md#requestserveradminaccountemailverificationapiv1serveradminaccountsaccountidemailverificationrequestpost) | **POST** /api/v1/server-admin/accounts/{accountId}/email-verification/request | Request Server Admin Account Email Verification |
| [**requestServerAdminAccountRecoveryEmailApiV1ServerAdminAccountsAccountIdRecoveryEmailPost**](ServerAdminApi.md#requestserveradminaccountrecoveryemailapiv1serveradminaccountsaccountidrecoveryemailpost) | **POST** /api/v1/server-admin/accounts/{accountId}/recovery/email | Request Server Admin Account Recovery Email |
| [**revokeServerAdminAccountSessionsApiV1ServerAdminAccountsAccountIdSessionsRevokePost**](ServerAdminApi.md#revokeserveradminaccountsessionsapiv1serveradminaccountsaccountidsessionsrevokepost) | **POST** /api/v1/server-admin/accounts/{accountId}/sessions/revoke | Revoke Server Admin Account Sessions |
| [**revokeServerAdminSpaceEntitlementGrantApiV1ServerAdminSpacesSpaceIdEntitlementGrantsGrantIdRevokePost**](ServerAdminApi.md#revokeserveradminspaceentitlementgrantapiv1serveradminspacesspaceidentitlementgrantsgrantidrevokepost) | **POST** /api/v1/server-admin/spaces/{space_id}/entitlement/grants/{grant_id}/revoke | Revoke Server Admin Space Entitlement Grant |
| [**updateMaintenanceSettingApiV1ServerAdminSettingsMaintenancePut**](ServerAdminApi.md#updatemaintenancesettingapiv1serveradminsettingsmaintenanceput) | **PUT** /api/v1/server-admin/settings/maintenance | Update Maintenance Setting |
| [**updateRegistrationSettingApiV1ServerAdminSettingsRegistrationPut**](ServerAdminApi.md#updateregistrationsettingapiv1serveradminsettingsregistrationput) | **PUT** /api/v1/server-admin/settings/registration | Update Registration Setting |
| [**updateServerAdminAccountSuspensionApiV1ServerAdminAccountsAccountIdSuspensionPut**](ServerAdminApi.md#updateserveradminaccountsuspensionapiv1serveradminaccountsaccountidsuspensionput) | **PUT** /api/v1/server-admin/accounts/{accountId}/suspension | Update Server Admin Account Suspension |
| [**verifyServerAdminAccountEmailApiV1ServerAdminAccountsAccountIdEmailsAccountEmailIdVerifyPost**](ServerAdminApi.md#verifyserveradminaccountemailapiv1serveradminaccountsaccountidemailsaccountemailidverifypost) | **POST** /api/v1/server-admin/accounts/{accountId}/emails/{accountEmailId}/verify | Verify Server Admin Account Email |



## deleteServerAdminAccountApiV1ServerAdminAccountsAccountIdDeletionPost

> ServerAdminAccountDeletionResult deleteServerAdminAccountApiV1ServerAdminAccountsAccountIdDeletionPost(accountId, serverAdminAccountDeletionRequest)

Delete Server Admin Account

### Example

```ts
import {
  Configuration,
  ServerAdminApi,
} from '';
import type { DeleteServerAdminAccountApiV1ServerAdminAccountsAccountIdDeletionPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ServerAdminApi();

  const body = {
    // string
    accountId: accountId_example,
    // ServerAdminAccountDeletionRequest
    serverAdminAccountDeletionRequest: ...,
  } satisfies DeleteServerAdminAccountApiV1ServerAdminAccountsAccountIdDeletionPostRequest;

  try {
    const data = await api.deleteServerAdminAccountApiV1ServerAdminAccountsAccountIdDeletionPost(body);
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
| **serverAdminAccountDeletionRequest** | [ServerAdminAccountDeletionRequest](ServerAdminAccountDeletionRequest.md) |  | |

### Return type

[**ServerAdminAccountDeletionResult**](ServerAdminAccountDeletionResult.md)

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
| **503** | A capability required for this operation is not configured on this instance. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getServerAdminAccountApiV1ServerAdminAccountsAccountIdGet

> ServerAdminAccountDetail getServerAdminAccountApiV1ServerAdminAccountsAccountIdGet(accountId)

Get Server Admin Account

### Example

```ts
import {
  Configuration,
  ServerAdminApi,
} from '';
import type { GetServerAdminAccountApiV1ServerAdminAccountsAccountIdGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ServerAdminApi();

  const body = {
    // string
    accountId: accountId_example,
  } satisfies GetServerAdminAccountApiV1ServerAdminAccountsAccountIdGetRequest;

  try {
    const data = await api.getServerAdminAccountApiV1ServerAdminAccountsAccountIdGet(body);
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

### Return type

[**ServerAdminAccountDetail**](ServerAdminAccountDetail.md)

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


## getServerAdminActionActivityApiV1ServerAdminActivityActionsGet

> Array&lt;ServerAdminActionActivityItem&gt; getServerAdminActionActivityApiV1ServerAdminActivityActionsGet()

Get Server Admin Action Activity

### Example

```ts
import {
  Configuration,
  ServerAdminApi,
} from '';
import type { GetServerAdminActionActivityApiV1ServerAdminActivityActionsGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ServerAdminApi();

  try {
    const data = await api.getServerAdminActionActivityApiV1ServerAdminActivityActionsGet();
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

[**Array&lt;ServerAdminActionActivityItem&gt;**](ServerAdminActionActivityItem.md)

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

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getServerAdminActivityApiV1ServerAdminActivityGet

> Array&lt;ServerAdminActivityItem&gt; getServerAdminActivityApiV1ServerAdminActivityGet()

Get Server Admin Activity

### Example

```ts
import {
  Configuration,
  ServerAdminApi,
} from '';
import type { GetServerAdminActivityApiV1ServerAdminActivityGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ServerAdminApi();

  try {
    const data = await api.getServerAdminActivityApiV1ServerAdminActivityGet();
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

[**Array&lt;ServerAdminActivityItem&gt;**](ServerAdminActivityItem.md)

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

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getServerAdminOverviewApiV1ServerAdminOverviewGet

> ServerAdminOverview getServerAdminOverviewApiV1ServerAdminOverviewGet()

Get Server Admin Overview

Return safe operational state for an authorized ServerAdmin.

### Example

```ts
import {
  Configuration,
  ServerAdminApi,
} from '';
import type { GetServerAdminOverviewApiV1ServerAdminOverviewGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ServerAdminApi();

  try {
    const data = await api.getServerAdminOverviewApiV1ServerAdminOverviewGet();
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

[**ServerAdminOverview**](ServerAdminOverview.md)

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

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getServerAdminPrivilegedActivityApiV1ServerAdminActivityPrivilegedGet

> ServerAdminPrivilegedAuditPage getServerAdminPrivilegedActivityApiV1ServerAdminActivityPrivilegedGet(category, action, actorId, targetId, createdFrom, createdTo, limit, offset)

Get Server Admin Privileged Activity

### Example

```ts
import {
  Configuration,
  ServerAdminApi,
} from '';
import type { GetServerAdminPrivilegedActivityApiV1ServerAdminActivityPrivilegedGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ServerAdminApi();

  const body = {
    // 'all' | 'settings' | 'accounts' | 'spaces' | 'destructive' (optional)
    category: category_example,
    // string (optional)
    action: action_example,
    // string (optional)
    actorId: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string (optional)
    targetId: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // Date (optional)
    createdFrom: 2013-10-20T19:20:30+01:00,
    // Date (optional)
    createdTo: 2013-10-20T19:20:30+01:00,
    // number (optional)
    limit: 56,
    // number (optional)
    offset: 56,
  } satisfies GetServerAdminPrivilegedActivityApiV1ServerAdminActivityPrivilegedGetRequest;

  try {
    const data = await api.getServerAdminPrivilegedActivityApiV1ServerAdminActivityPrivilegedGet(body);
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
| **category** | `all`, `settings`, `accounts`, `spaces`, `destructive` |  | [Optional] [Defaults to `&#39;all&#39;`] [Enum: all, settings, accounts, spaces, destructive] |
| **action** | `string` |  | [Optional] [Defaults to `undefined`] |
| **actorId** | `string` |  | [Optional] [Defaults to `undefined`] |
| **targetId** | `string` |  | [Optional] [Defaults to `undefined`] |
| **createdFrom** | `Date` |  | [Optional] [Defaults to `undefined`] |
| **createdTo** | `Date` |  | [Optional] [Defaults to `undefined`] |
| **limit** | `number` |  | [Optional] [Defaults to `25`] |
| **offset** | `number` |  | [Optional] [Defaults to `0`] |

### Return type

[**ServerAdminPrivilegedAuditPage**](ServerAdminPrivilegedAuditPage.md)

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

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getServerAdminSettingsApiV1ServerAdminSettingsGet

> ServerAdminSettings getServerAdminSettingsApiV1ServerAdminSettingsGet()

Get Server Admin Settings

### Example

```ts
import {
  Configuration,
  ServerAdminApi,
} from '';
import type { GetServerAdminSettingsApiV1ServerAdminSettingsGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ServerAdminApi();

  try {
    const data = await api.getServerAdminSettingsApiV1ServerAdminSettingsGet();
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

[**ServerAdminSettings**](ServerAdminSettings.md)

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

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getServerAdminSpaceApiV1ServerAdminSpacesSpaceIdGet

> ServerAdminSpaceDetail getServerAdminSpaceApiV1ServerAdminSpacesSpaceIdGet(spaceId)

Get Server Admin Space

Return one Space\&#39;s privacy-safe lifecycle projection.

### Example

```ts
import {
  Configuration,
  ServerAdminApi,
} from '';
import type { GetServerAdminSpaceApiV1ServerAdminSpacesSpaceIdGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ServerAdminApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies GetServerAdminSpaceApiV1ServerAdminSpacesSpaceIdGetRequest;

  try {
    const data = await api.getServerAdminSpaceApiV1ServerAdminSpacesSpaceIdGet(body);
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

[**ServerAdminSpaceDetail**](ServerAdminSpaceDetail.md)

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


## getServerAdminSpaceEntitlementApiV1ServerAdminSpacesSpaceIdEntitlementGet

> ServerAdminSpaceEntitlementView getServerAdminSpaceEntitlementApiV1ServerAdminSpacesSpaceIdEntitlementGet(spaceId)

Get Server Admin Space Entitlement

Return the effective entitlement state and full grant history for a Space.

### Example

```ts
import {
  Configuration,
  ServerAdminApi,
} from '';
import type { GetServerAdminSpaceEntitlementApiV1ServerAdminSpacesSpaceIdEntitlementGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ServerAdminApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies GetServerAdminSpaceEntitlementApiV1ServerAdminSpacesSpaceIdEntitlementGetRequest;

  try {
    const data = await api.getServerAdminSpaceEntitlementApiV1ServerAdminSpacesSpaceIdEntitlementGet(body);
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

[**ServerAdminSpaceEntitlementView**](ServerAdminSpaceEntitlementView.md)

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


## getServerAdminStorageApiV1ServerAdminStorageGet

> ServerAdminStorageOverview getServerAdminStorageApiV1ServerAdminStorageGet()

Get Server Admin Storage

Return authoritative aggregate storage state, never an attachment directory.

### Example

```ts
import {
  Configuration,
  ServerAdminApi,
} from '';
import type { GetServerAdminStorageApiV1ServerAdminStorageGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ServerAdminApi();

  try {
    const data = await api.getServerAdminStorageApiV1ServerAdminStorageGet();
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

[**ServerAdminStorageOverview**](ServerAdminStorageOverview.md)

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

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## grantServerAdminSpaceEntitlementApiV1ServerAdminSpacesSpaceIdEntitlementGrantsPost

> ServerAdminSpaceEntitlementView grantServerAdminSpaceEntitlementApiV1ServerAdminSpacesSpaceIdEntitlementGrantsPost(spaceId, serverAdminEntitlementGrantRequest)

Grant Server Admin Space Entitlement

Record a manual Premium grant for a Space (V1 launch entitlement source).  This is the only entitlement source implemented for the first launch; Google Play/Stripe/Self-Hosted-license adapters are deliberately out of scope until a real launch channel requires them (docs/m6/ ENTITLEMENT-BOUNDARY.md §7). It reuses the existing normalized &#x60;record_grant&#x60; source-update interface unchanged rather than adding a second grant-mutation path.  Granting unlimited Premium is as consequential as the other high-risk ServerAdmin actions in this router (account deletion, email verification, recovery issuance), so it requires the same step-up re-authentication.

### Example

```ts
import {
  Configuration,
  ServerAdminApi,
} from '';
import type { GrantServerAdminSpaceEntitlementApiV1ServerAdminSpacesSpaceIdEntitlementGrantsPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ServerAdminApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // ServerAdminEntitlementGrantRequest
    serverAdminEntitlementGrantRequest: ...,
  } satisfies GrantServerAdminSpaceEntitlementApiV1ServerAdminSpacesSpaceIdEntitlementGrantsPostRequest;

  try {
    const data = await api.grantServerAdminSpaceEntitlementApiV1ServerAdminSpacesSpaceIdEntitlementGrantsPost(body);
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
| **serverAdminEntitlementGrantRequest** | [ServerAdminEntitlementGrantRequest](ServerAdminEntitlementGrantRequest.md) |  | |

### Return type

[**ServerAdminSpaceEntitlementView**](ServerAdminSpaceEntitlementView.md)

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

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## issueServerAdminOperatorRecoveryApiV1ServerAdminAccountsAccountIdRecoveryOperatorPost

> ServerAdminRecoveryProof issueServerAdminOperatorRecoveryApiV1ServerAdminAccountsAccountIdRecoveryOperatorPost(accountId)

Issue Server Admin Operator Recovery

### Example

```ts
import {
  Configuration,
  ServerAdminApi,
} from '';
import type { IssueServerAdminOperatorRecoveryApiV1ServerAdminAccountsAccountIdRecoveryOperatorPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ServerAdminApi();

  const body = {
    // string
    accountId: accountId_example,
  } satisfies IssueServerAdminOperatorRecoveryApiV1ServerAdminAccountsAccountIdRecoveryOperatorPostRequest;

  try {
    const data = await api.issueServerAdminOperatorRecoveryApiV1ServerAdminAccountsAccountIdRecoveryOperatorPost(body);
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

### Return type

[**ServerAdminRecoveryProof**](ServerAdminRecoveryProof.md)

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
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## listServerAdminAccountsApiV1ServerAdminAccountsGet

> ServerAdminAccountList listServerAdminAccountsApiV1ServerAdminAccountsGet(query, status, verification, limit, offset)

List Server Admin Accounts

Return Account identity/security metadata without relationship content.

### Example

```ts
import {
  Configuration,
  ServerAdminApi,
} from '';
import type { ListServerAdminAccountsApiV1ServerAdminAccountsGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ServerAdminApi();

  const body = {
    // string (optional)
    query: query_example,
    // 'all' | 'active' | 'suspended' (optional)
    status: status_example,
    // 'all' | 'verified' | 'unverified' (optional)
    verification: verification_example,
    // number (optional)
    limit: 56,
    // number (optional)
    offset: 56,
  } satisfies ListServerAdminAccountsApiV1ServerAdminAccountsGetRequest;

  try {
    const data = await api.listServerAdminAccountsApiV1ServerAdminAccountsGet(body);
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
| **query** | `string` |  | [Optional] [Defaults to `undefined`] |
| **status** | `all`, `active`, `suspended` |  | [Optional] [Defaults to `&#39;all&#39;`] [Enum: all, active, suspended] |
| **verification** | `all`, `verified`, `unverified` |  | [Optional] [Defaults to `&#39;all&#39;`] [Enum: all, verified, unverified] |
| **limit** | `number` |  | [Optional] [Defaults to `50`] |
| **offset** | `number` |  | [Optional] [Defaults to `0`] |

### Return type

[**ServerAdminAccountList**](ServerAdminAccountList.md)

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
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## listServerAdminJobsApiV1ServerAdminJobsGet

> ServerAdminJobList listServerAdminJobsApiV1ServerAdminJobsGet(status, kind, exhausted, createdWithin, limit, offset)

List Server Admin Jobs

List technical job state without selecting sensitive queue columns.

### Example

```ts
import {
  Configuration,
  ServerAdminApi,
} from '';
import type { ListServerAdminJobsApiV1ServerAdminJobsGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ServerAdminApi();

  const body = {
    // 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' (optional)
    status: status_example,
    // string (optional)
    kind: kind_example,
    // boolean (optional)
    exhausted: true,
    // '24h' | '7d' | '30d' (optional)
    createdWithin: createdWithin_example,
    // number (optional)
    limit: 56,
    // number (optional)
    offset: 56,
  } satisfies ListServerAdminJobsApiV1ServerAdminJobsGetRequest;

  try {
    const data = await api.listServerAdminJobsApiV1ServerAdminJobsGet(body);
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
| **status** | `PENDING`, `RUNNING`, `SUCCEEDED`, `FAILED` |  | [Optional] [Defaults to `undefined`] [Enum: PENDING, RUNNING, SUCCEEDED, FAILED] |
| **kind** | `string` |  | [Optional] [Defaults to `undefined`] |
| **exhausted** | `boolean` |  | [Optional] [Defaults to `undefined`] |
| **createdWithin** | `24h`, `7d`, `30d` |  | [Optional] [Defaults to `undefined`] [Enum: 24h, 7d, 30d] |
| **limit** | `number` |  | [Optional] [Defaults to `50`] |
| **offset** | `number` |  | [Optional] [Defaults to `0`] |

### Return type

[**ServerAdminJobList**](ServerAdminJobList.md)

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
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## listServerAdminSpacesApiV1ServerAdminSpacesGet

> ServerAdminSpaceList listServerAdminSpacesApiV1ServerAdminSpacesGet(query, status, limit, offset)

List Server Admin Spaces

Return lifecycle metadata for Spaces without relationship content.

### Example

```ts
import {
  Configuration,
  ServerAdminApi,
} from '';
import type { ListServerAdminSpacesApiV1ServerAdminSpacesGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ServerAdminApi();

  const body = {
    // string (optional)
    query: query_example,
    // 'all' | 'active' | 'inactive' | 'empty' | 'anomaly' (optional)
    status: status_example,
    // number (optional)
    limit: 56,
    // number (optional)
    offset: 56,
  } satisfies ListServerAdminSpacesApiV1ServerAdminSpacesGetRequest;

  try {
    const data = await api.listServerAdminSpacesApiV1ServerAdminSpacesGet(body);
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
| **query** | `string` |  | [Optional] [Defaults to `undefined`] |
| **status** | `all`, `active`, `inactive`, `empty`, `anomaly` |  | [Optional] [Defaults to `&#39;all&#39;`] [Enum: all, active, inactive, empty, anomaly] |
| **limit** | `number` |  | [Optional] [Defaults to `50`] |
| **offset** | `number` |  | [Optional] [Defaults to `0`] |

### Return type

[**ServerAdminSpaceList**](ServerAdminSpaceList.md)

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
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## reconcileServerAdminSpaceConfigurationManager

> ServerAdminSpaceConfigurationManagerView reconcileServerAdminSpaceConfigurationManager(spaceId, serverAdminSpaceConfigurationManagerReconcileRequest)

Reconcile Server Admin Space Configuration Manager

Assign missing legacy Space configuration authority exactly once.

### Example

```ts
import {
  Configuration,
  ServerAdminApi,
} from '';
import type { ReconcileServerAdminSpaceConfigurationManagerRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ServerAdminApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // ServerAdminSpaceConfigurationManagerReconcileRequest
    serverAdminSpaceConfigurationManagerReconcileRequest: ...,
  } satisfies ReconcileServerAdminSpaceConfigurationManagerRequest;

  try {
    const data = await api.reconcileServerAdminSpaceConfigurationManager(body);
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
| **serverAdminSpaceConfigurationManagerReconcileRequest** | [ServerAdminSpaceConfigurationManagerReconcileRequest](ServerAdminSpaceConfigurationManagerReconcileRequest.md) |  | |

### Return type

[**ServerAdminSpaceConfigurationManagerView**](ServerAdminSpaceConfigurationManagerView.md)

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


## requestServerAdminAccountEmailVerificationApiV1ServerAdminAccountsAccountIdEmailVerificationRequestPost

> requestServerAdminAccountEmailVerificationApiV1ServerAdminAccountsAccountIdEmailVerificationRequestPost(accountId)

Request Server Admin Account Email Verification

### Example

```ts
import {
  Configuration,
  ServerAdminApi,
} from '';
import type { RequestServerAdminAccountEmailVerificationApiV1ServerAdminAccountsAccountIdEmailVerificationRequestPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ServerAdminApi();

  const body = {
    // string
    accountId: accountId_example,
  } satisfies RequestServerAdminAccountEmailVerificationApiV1ServerAdminAccountsAccountIdEmailVerificationRequestPostRequest;

  try {
    const data = await api.requestServerAdminAccountEmailVerificationApiV1ServerAdminAccountsAccountIdEmailVerificationRequestPost(body);
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
| **202** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |
| **429** | Too many attempts occurred within the allowed time window. |  -  |
| **503** | A capability required for this operation is not configured on this instance. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## requestServerAdminAccountRecoveryEmailApiV1ServerAdminAccountsAccountIdRecoveryEmailPost

> ServerAdminRecoveryEmailResult requestServerAdminAccountRecoveryEmailApiV1ServerAdminAccountsAccountIdRecoveryEmailPost(accountId)

Request Server Admin Account Recovery Email

### Example

```ts
import {
  Configuration,
  ServerAdminApi,
} from '';
import type { RequestServerAdminAccountRecoveryEmailApiV1ServerAdminAccountsAccountIdRecoveryEmailPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ServerAdminApi();

  const body = {
    // string
    accountId: accountId_example,
  } satisfies RequestServerAdminAccountRecoveryEmailApiV1ServerAdminAccountsAccountIdRecoveryEmailPostRequest;

  try {
    const data = await api.requestServerAdminAccountRecoveryEmailApiV1ServerAdminAccountsAccountIdRecoveryEmailPost(body);
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

### Return type

[**ServerAdminRecoveryEmailResult**](ServerAdminRecoveryEmailResult.md)

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
| **422** | Request parameters or domain inputs are invalid. |  -  |
| **503** | A capability required for this operation is not configured on this instance. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## revokeServerAdminAccountSessionsApiV1ServerAdminAccountsAccountIdSessionsRevokePost

> ServerAdminSessionRevocationResult revokeServerAdminAccountSessionsApiV1ServerAdminAccountsAccountIdSessionsRevokePost(accountId)

Revoke Server Admin Account Sessions

### Example

```ts
import {
  Configuration,
  ServerAdminApi,
} from '';
import type { RevokeServerAdminAccountSessionsApiV1ServerAdminAccountsAccountIdSessionsRevokePostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ServerAdminApi();

  const body = {
    // string
    accountId: accountId_example,
  } satisfies RevokeServerAdminAccountSessionsApiV1ServerAdminAccountsAccountIdSessionsRevokePostRequest;

  try {
    const data = await api.revokeServerAdminAccountSessionsApiV1ServerAdminAccountsAccountIdSessionsRevokePost(body);
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

### Return type

[**ServerAdminSessionRevocationResult**](ServerAdminSessionRevocationResult.md)

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


## revokeServerAdminSpaceEntitlementGrantApiV1ServerAdminSpacesSpaceIdEntitlementGrantsGrantIdRevokePost

> ServerAdminSpaceEntitlementView revokeServerAdminSpaceEntitlementGrantApiV1ServerAdminSpacesSpaceIdEntitlementGrantsGrantIdRevokePost(spaceId, grantId, serverAdminEntitlementRevokeRequest)

Revoke Server Admin Space Entitlement Grant

Revoke one grant (e.g. an admin mistake, abuse, or a refund/chargeback).  Revoking a paying customer\&#39;s entitlement is as consequential as the other high-risk ServerAdmin actions in this router, so it requires the same step-up re-authentication.

### Example

```ts
import {
  Configuration,
  ServerAdminApi,
} from '';
import type { RevokeServerAdminSpaceEntitlementGrantApiV1ServerAdminSpacesSpaceIdEntitlementGrantsGrantIdRevokePostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ServerAdminApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // string
    grantId: grantId_example,
    // ServerAdminEntitlementRevokeRequest
    serverAdminEntitlementRevokeRequest: ...,
  } satisfies RevokeServerAdminSpaceEntitlementGrantApiV1ServerAdminSpacesSpaceIdEntitlementGrantsGrantIdRevokePostRequest;

  try {
    const data = await api.revokeServerAdminSpaceEntitlementGrantApiV1ServerAdminSpacesSpaceIdEntitlementGrantsGrantIdRevokePost(body);
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
| **grantId** | `string` |  | [Defaults to `undefined`] |
| **serverAdminEntitlementRevokeRequest** | [ServerAdminEntitlementRevokeRequest](ServerAdminEntitlementRevokeRequest.md) |  | |

### Return type

[**ServerAdminSpaceEntitlementView**](ServerAdminSpaceEntitlementView.md)

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

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## updateMaintenanceSettingApiV1ServerAdminSettingsMaintenancePut

> ServerAdminSettings updateMaintenanceSettingApiV1ServerAdminSettingsMaintenancePut(serverAdminSettingUpdate)

Update Maintenance Setting

### Example

```ts
import {
  Configuration,
  ServerAdminApi,
} from '';
import type { UpdateMaintenanceSettingApiV1ServerAdminSettingsMaintenancePutRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ServerAdminApi();

  const body = {
    // ServerAdminSettingUpdate
    serverAdminSettingUpdate: ...,
  } satisfies UpdateMaintenanceSettingApiV1ServerAdminSettingsMaintenancePutRequest;

  try {
    const data = await api.updateMaintenanceSettingApiV1ServerAdminSettingsMaintenancePut(body);
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
| **serverAdminSettingUpdate** | [ServerAdminSettingUpdate](ServerAdminSettingUpdate.md) |  | |

### Return type

[**ServerAdminSettings**](ServerAdminSettings.md)

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
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## updateRegistrationSettingApiV1ServerAdminSettingsRegistrationPut

> ServerAdminSettings updateRegistrationSettingApiV1ServerAdminSettingsRegistrationPut(serverAdminSettingUpdate)

Update Registration Setting

### Example

```ts
import {
  Configuration,
  ServerAdminApi,
} from '';
import type { UpdateRegistrationSettingApiV1ServerAdminSettingsRegistrationPutRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ServerAdminApi();

  const body = {
    // ServerAdminSettingUpdate
    serverAdminSettingUpdate: ...,
  } satisfies UpdateRegistrationSettingApiV1ServerAdminSettingsRegistrationPutRequest;

  try {
    const data = await api.updateRegistrationSettingApiV1ServerAdminSettingsRegistrationPut(body);
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
| **serverAdminSettingUpdate** | [ServerAdminSettingUpdate](ServerAdminSettingUpdate.md) |  | |

### Return type

[**ServerAdminSettings**](ServerAdminSettings.md)

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
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## updateServerAdminAccountSuspensionApiV1ServerAdminAccountsAccountIdSuspensionPut

> ServerAdminAccountDetail updateServerAdminAccountSuspensionApiV1ServerAdminAccountsAccountIdSuspensionPut(accountId, serverAdminAccountSuspensionUpdate)

Update Server Admin Account Suspension

### Example

```ts
import {
  Configuration,
  ServerAdminApi,
} from '';
import type { UpdateServerAdminAccountSuspensionApiV1ServerAdminAccountsAccountIdSuspensionPutRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ServerAdminApi();

  const body = {
    // string
    accountId: accountId_example,
    // ServerAdminAccountSuspensionUpdate
    serverAdminAccountSuspensionUpdate: ...,
  } satisfies UpdateServerAdminAccountSuspensionApiV1ServerAdminAccountsAccountIdSuspensionPutRequest;

  try {
    const data = await api.updateServerAdminAccountSuspensionApiV1ServerAdminAccountsAccountIdSuspensionPut(body);
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
| **serverAdminAccountSuspensionUpdate** | [ServerAdminAccountSuspensionUpdate](ServerAdminAccountSuspensionUpdate.md) |  | |

### Return type

[**ServerAdminAccountDetail**](ServerAdminAccountDetail.md)

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

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## verifyServerAdminAccountEmailApiV1ServerAdminAccountsAccountIdEmailsAccountEmailIdVerifyPost

> ServerAdminAccountEmail verifyServerAdminAccountEmailApiV1ServerAdminAccountsAccountIdEmailsAccountEmailIdVerifyPost(accountId, accountEmailId, serverAdminEmailVerificationRequest)

Verify Server Admin Account Email

### Example

```ts
import {
  Configuration,
  ServerAdminApi,
} from '';
import type { VerifyServerAdminAccountEmailApiV1ServerAdminAccountsAccountIdEmailsAccountEmailIdVerifyPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ServerAdminApi();

  const body = {
    // string
    accountId: accountId_example,
    // string
    accountEmailId: accountEmailId_example,
    // ServerAdminEmailVerificationRequest
    serverAdminEmailVerificationRequest: ...,
  } satisfies VerifyServerAdminAccountEmailApiV1ServerAdminAccountsAccountIdEmailsAccountEmailIdVerifyPostRequest;

  try {
    const data = await api.verifyServerAdminAccountEmailApiV1ServerAdminAccountsAccountIdEmailsAccountEmailIdVerifyPost(body);
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
| **accountEmailId** | `string` |  | [Defaults to `undefined`] |
| **serverAdminEmailVerificationRequest** | [ServerAdminEmailVerificationRequest](ServerAdminEmailVerificationRequest.md) |  | |

### Return type

[**ServerAdminAccountEmail**](ServerAdminAccountEmail.md)

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

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

