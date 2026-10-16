# RulesApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**getRulePreference**](RulesApi.md#getrulepreference) | **GET** /api/v1/spaces/{spaceId}/rules/{ruleKey}/preference | Get Rule Preference |
| [**listRules**](RulesApi.md#listrules) | **GET** /api/v1/spaces/{spaceId}/rules | List Rules |
| [**setRulePreference**](RulesApi.md#setrulepreference) | **PUT** /api/v1/spaces/{spaceId}/rules/{ruleKey}/preference | Set Rule Preference |



## getRulePreference

> RulePreferenceView getRulePreference(ruleKey, spaceId)

Get Rule Preference

### Example

```ts
import {
  Configuration,
  RulesApi,
} from '';
import type { GetRulePreferenceRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new RulesApi();

  const body = {
    // string
    ruleKey: ruleKey_example,
    // string
    spaceId: spaceId_example,
  } satisfies GetRulePreferenceRequest;

  try {
    const data = await api.getRulePreference(body);
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
| **ruleKey** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**RulePreferenceView**](RulePreferenceView.md)

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


## listRules

> RuleList listRules(spaceId)

List Rules

### Example

```ts
import {
  Configuration,
  RulesApi,
} from '';
import type { ListRulesRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new RulesApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies ListRulesRequest;

  try {
    const data = await api.listRules(body);
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

[**RuleList**](RuleList.md)

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


## setRulePreference

> RulePreferenceView setRulePreference(ruleKey, spaceId, rulePreferenceUpdate)

Set Rule Preference

### Example

```ts
import {
  Configuration,
  RulesApi,
} from '';
import type { SetRulePreferenceRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new RulesApi();

  const body = {
    // string
    ruleKey: ruleKey_example,
    // string
    spaceId: spaceId_example,
    // RulePreferenceUpdate
    rulePreferenceUpdate: ...,
  } satisfies SetRulePreferenceRequest;

  try {
    const data = await api.setRulePreference(body);
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
| **ruleKey** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **rulePreferenceUpdate** | [RulePreferenceUpdate](RulePreferenceUpdate.md) |  | |

### Return type

[**RulePreferenceView**](RulePreferenceView.md)

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
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

