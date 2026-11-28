# GiftCodesApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**redeemGiftCode**](GiftCodesApi.md#redeemgiftcode) | **POST** /api/v1/spaces/{spaceId}/gift-codes/redeem | Redeem Gift Code |



## redeemGiftCode

> GiftCodeRedemptionView redeemGiftCode(spaceId, giftCodeRedeemRequest)

Redeem Gift Code

Redeem a gift code for the Space; any member may, also before the partner joined.  Problems: &#x60;&#x60;GIFT_CODE_INVALID&#x60;&#x60; (unknown, malformed, revoked or expired), &#x60;&#x60;GIFT_CODE_USED&#x60;&#x60;, &#x60;&#x60;GIFT_CODE_SUBSCRIPTION_ACTIVE&#x60;&#x60; and &#x60;&#x60;GIFT_CODE_UNLIMITED&#x60;&#x60; (the code stays unused), &#x60;&#x60;RATE_LIMITED&#x60;&#x60;. Every attempt counts against the limits, also a refused or successful one.

### Example

```ts
import {
  Configuration,
  GiftCodesApi,
} from '';
import type { RedeemGiftCodeRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new GiftCodesApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // GiftCodeRedeemRequest
    giftCodeRedeemRequest: ...,
  } satisfies RedeemGiftCodeRequest;

  try {
    const data = await api.redeemGiftCode(body);
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
| **giftCodeRedeemRequest** | [GiftCodeRedeemRequest](GiftCodeRedeemRequest.md) |  | |

### Return type

[**GiftCodeRedemptionView**](GiftCodeRedemptionView.md)

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
| **429** | Too many attempts occurred within the allowed time window. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

