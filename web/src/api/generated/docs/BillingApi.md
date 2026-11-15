# BillingApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**getBillingChannelsApiV1SpacesSpaceIdBillingChannelsGet**](BillingApi.md#getbillingchannelsapiv1spacesspaceidbillingchannelsget) | **GET** /api/v1/spaces/{spaceId}/billing/channels | Get Billing Channels |
| [**startStorePurchaseApiV1SpacesSpaceIdBillingPurchasesPost**](BillingApi.md#startstorepurchaseapiv1spacesspaceidbillingpurchasespost) | **POST** /api/v1/spaces/{spaceId}/billing/purchases | Start Store Purchase |
| [**submitGooglePlayPurchaseApiV1SpacesSpaceIdBillingGooglePlayPurchasesPost**](BillingApi.md#submitgoogleplaypurchaseapiv1spacesspaceidbillinggoogleplaypurchasespost) | **POST** /api/v1/spaces/{spaceId}/billing/google-play/purchases | Submit Google Play Purchase |



## getBillingChannelsApiV1SpacesSpaceIdBillingChannelsGet

> BillingChannelsView getBillingChannelsApiV1SpacesSpaceIdBillingChannelsGet(spaceId)

Get Billing Channels

List the purchase channels available for this Space\&#39;s installation.

### Example

```ts
import {
  Configuration,
  BillingApi,
} from '';
import type { GetBillingChannelsApiV1SpacesSpaceIdBillingChannelsGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new BillingApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies GetBillingChannelsApiV1SpacesSpaceIdBillingChannelsGetRequest;

  try {
    const data = await api.getBillingChannelsApiV1SpacesSpaceIdBillingChannelsGet(body);
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

[**BillingChannelsView**](BillingChannelsView.md)

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


## startStorePurchaseApiV1SpacesSpaceIdBillingPurchasesPost

> StorePurchaseStartView startStorePurchaseApiV1SpacesSpaceIdBillingPurchasesPost(spaceId, storePurchaseStartRequest)

Start Store Purchase

Bind the purchasing Account and this Space before the store sheet opens.  &#x60;409 BILLING_SPACE_ALREADY_PREMIUM&#x60; means Pro is already active for the Space, for example through the partner\&#39;s subscription.

### Example

```ts
import {
  Configuration,
  BillingApi,
} from '';
import type { StartStorePurchaseApiV1SpacesSpaceIdBillingPurchasesPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new BillingApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // StorePurchaseStartRequest
    storePurchaseStartRequest: ...,
  } satisfies StartStorePurchaseApiV1SpacesSpaceIdBillingPurchasesPostRequest;

  try {
    const data = await api.startStorePurchaseApiV1SpacesSpaceIdBillingPurchasesPost(body);
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
| **storePurchaseStartRequest** | [StorePurchaseStartRequest](StorePurchaseStartRequest.md) |  | |

### Return type

[**StorePurchaseStartView**](StorePurchaseStartView.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **201** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## submitGooglePlayPurchaseApiV1SpacesSpaceIdBillingGooglePlayPurchasesPost

> StorePurchaseResultView submitGooglePlayPurchaseApiV1SpacesSpaceIdBillingGooglePlayPurchasesPost(spaceId, storePurchaseSubmitRequest)

Submit Google Play Purchase

Verify a Google Play purchase token with Google and update the Space.  &#x60;pending&#x60; grants nothing until Google confirms the payment; the grant then follows from the real-time developer notification.

### Example

```ts
import {
  Configuration,
  BillingApi,
} from '';
import type { SubmitGooglePlayPurchaseApiV1SpacesSpaceIdBillingGooglePlayPurchasesPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new BillingApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // StorePurchaseSubmitRequest
    storePurchaseSubmitRequest: ...,
  } satisfies SubmitGooglePlayPurchaseApiV1SpacesSpaceIdBillingGooglePlayPurchasesPostRequest;

  try {
    const data = await api.submitGooglePlayPurchaseApiV1SpacesSpaceIdBillingGooglePlayPurchasesPost(body);
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
| **storePurchaseSubmitRequest** | [StorePurchaseSubmitRequest](StorePurchaseSubmitRequest.md) |  | |

### Return type

[**StorePurchaseResultView**](StorePurchaseResultView.md)

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
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |
| **503** | A capability required for this operation is not configured on this instance. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

