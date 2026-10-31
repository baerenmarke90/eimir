# WishSelectionsApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**closeWishSelectionRound**](WishSelectionsApi.md#closewishselectionround) | **DELETE** /api/v1/spaces/{spaceId}/wish-selection | Close Wish Selection Round |
| [**getWishSelection**](WishSelectionsApi.md#getwishselection) | **GET** /api/v1/spaces/{spaceId}/wish-selection | Get Wish Selection |
| [**replaceWishSelectionRound**](WishSelectionsApi.md#replacewishselectionround) | **PUT** /api/v1/spaces/{spaceId}/wish-selection | Replace Wish Selection Round |
| [**updateOwnWishSelection**](WishSelectionsApi.md#updateownwishselection) | **PUT** /api/v1/spaces/{spaceId}/wish-selection/own | Update Own Wish Selection |



## closeWishSelectionRound

> closeWishSelectionRound(spaceId, ifMatch)

Close Wish Selection Round

### Example

```ts
import {
  Configuration,
  WishSelectionsApi,
} from '';
import type { CloseWishSelectionRoundRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new WishSelectionsApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // string | The last-read opaque resource state, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
  } satisfies CloseWishSelectionRoundRequest;

  try {
    const data = await api.closeWishSelectionRound(body);
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
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getWishSelection

> WishSelectionView getWishSelection(spaceId)

Get Wish Selection

### Example

```ts
import {
  Configuration,
  WishSelectionsApi,
} from '';
import type { GetWishSelectionRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new WishSelectionsApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies GetWishSelectionRequest;

  try {
    const data = await api.getWishSelection(body);
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

[**WishSelectionView**](WishSelectionView.md)

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


## replaceWishSelectionRound

> WishSelectionView replaceWishSelectionRound(spaceId, ifMatch, wishSelectionRoundUpdate)

Replace Wish Selection Round

### Example

```ts
import {
  Configuration,
  WishSelectionsApi,
} from '';
import type { ReplaceWishSelectionRoundRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new WishSelectionsApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // string | The last-read opaque resource state, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
    // WishSelectionRoundUpdate
    wishSelectionRoundUpdate: ...,
  } satisfies ReplaceWishSelectionRoundRequest;

  try {
    const data = await api.replaceWishSelectionRound(body);
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
| **wishSelectionRoundUpdate** | [WishSelectionRoundUpdate](WishSelectionRoundUpdate.md) |  | |

### Return type

[**WishSelectionView**](WishSelectionView.md)

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

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## updateOwnWishSelection

> WishSelectionView updateOwnWishSelection(spaceId, ifMatch, wishSelectionUpdate)

Update Own Wish Selection

### Example

```ts
import {
  Configuration,
  WishSelectionsApi,
} from '';
import type { UpdateOwnWishSelectionRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new WishSelectionsApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // string | The last-read opaque resource state, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
    // WishSelectionUpdate
    wishSelectionUpdate: ...,
  } satisfies UpdateOwnWishSelectionRequest;

  try {
    const data = await api.updateOwnWishSelection(body);
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
| **wishSelectionUpdate** | [WishSelectionUpdate](WishSelectionUpdate.md) |  | |

### Return type

[**WishSelectionView**](WishSelectionView.md)

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

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

