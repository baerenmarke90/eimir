# WishesApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**completeWish**](WishesApi.md#completewish) | **POST** /api/v1/spaces/{spaceId}/wishes/{wishId}/complete | Complete Wish |
| [**createWish**](WishesApi.md#createwish) | **POST** /api/v1/spaces/{spaceId}/wishes | Create Wish |
| [**deleteWish**](WishesApi.md#deletewish) | **DELETE** /api/v1/spaces/{spaceId}/wishes/{wishId} | Delete Wish |
| [**getWish**](WishesApi.md#getwish) | **GET** /api/v1/spaces/{spaceId}/wishes/{wishId} | Get Wish |
| [**listWishes**](WishesApi.md#listwishes) | **GET** /api/v1/spaces/{spaceId}/wishes | List Wishes |
| [**updateWish**](WishesApi.md#updatewish) | **PATCH** /api/v1/spaces/{spaceId}/wishes/{wishId} | Update Wish |



## completeWish

> WishDetail completeWish(wishId, spaceId, ifMatch)

Complete Wish

### Example

```ts
import {
  Configuration,
  WishesApi,
} from '';
import type { CompleteWishRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new WishesApi();

  const body = {
    // string
    wishId: wishId_example,
    // string
    spaceId: spaceId_example,
    // string | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
  } satisfies CompleteWishRequest;

  try {
    const data = await api.completeWish(body);
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
| **wishId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **ifMatch** | `string` | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header. | [Defaults to `undefined`] |

### Return type

[**WishDetail**](WishDetail.md)

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
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## createWish

> WishDetail createWish(spaceId, wishCreate, idempotencyKey)

Create Wish

### Example

```ts
import {
  Configuration,
  WishesApi,
} from '';
import type { CreateWishRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new WishesApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // WishCreate
    wishCreate: ...,
    // string | Optional request identity (a UUID chosen by the client for one save). Repeating the same request with the same key returns the original result instead of creating it again; the key is scoped to the authenticated Account and Space and is retained for a bounded time. (optional)
    idempotencyKey: idempotencyKey_example,
  } satisfies CreateWishRequest;

  try {
    const data = await api.createWish(body);
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
| **wishCreate** | [WishCreate](WishCreate.md) |  | |
| **idempotencyKey** | `string` | Optional request identity (a UUID chosen by the client for one save). Repeating the same request with the same key returns the original result instead of creating it again; the key is scoped to the authenticated Account and Space and is retained for a bounded time. | [Optional] [Defaults to `undefined`] |

### Return type

[**WishDetail**](WishDetail.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | The request identity (&#x60;Idempotency-Key&#x60;) was already used for an equivalent request. The response returns the original Wish in its current state; no second Wish is created. |  * ETag - Resource version to use for the next If-Match write request. <br>  |
| **201** | Successful Response |  * ETag - Resource version to use for the next If-Match write request. <br>  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## deleteWish

> deleteWish(wishId, spaceId, ifMatch)

Delete Wish

### Example

```ts
import {
  Configuration,
  WishesApi,
} from '';
import type { DeleteWishRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new WishesApi();

  const body = {
    // string
    wishId: wishId_example,
    // string
    spaceId: spaceId_example,
    // string | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
  } satisfies DeleteWishRequest;

  try {
    const data = await api.deleteWish(body);
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
| **wishId** | `string` |  | [Defaults to `undefined`] |
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
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getWish

> WishDetail getWish(wishId, spaceId)

Get Wish

### Example

```ts
import {
  Configuration,
  WishesApi,
} from '';
import type { GetWishRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new WishesApi();

  const body = {
    // string
    wishId: wishId_example,
    // string
    spaceId: spaceId_example,
  } satisfies GetWishRequest;

  try {
    const data = await api.getWish(body);
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
| **wishId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**WishDetail**](WishDetail.md)

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


## listWishes

> WishPage listWishes(spaceId, cursor, limit, status)

List Wishes

### Example

```ts
import {
  Configuration,
  WishesApi,
} from '';
import type { ListWishesRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new WishesApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // string (optional)
    cursor: cursor_example,
    // number (optional)
    limit: 56,
    // WishStatus (optional)
    status: ...,
  } satisfies ListWishesRequest;

  try {
    const data = await api.listWishes(body);
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
| **cursor** | `string` |  | [Optional] [Defaults to `undefined`] |
| **limit** | `number` |  | [Optional] [Defaults to `50`] |
| **status** | `WishStatus` |  | [Optional] [Defaults to `undefined`] [Enum: OPEN, PLANNED, COMPLETED] |

### Return type

[**WishPage**](WishPage.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **400** | The request is syntactically valid but cannot be processed in this form. |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## updateWish

> WishDetail updateWish(wishId, spaceId, ifMatch, wishUpdate)

Update Wish

### Example

```ts
import {
  Configuration,
  WishesApi,
} from '';
import type { UpdateWishRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new WishesApi();

  const body = {
    // string
    wishId: wishId_example,
    // string
    spaceId: spaceId_example,
    // string | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
    // WishUpdate
    wishUpdate: ...,
  } satisfies UpdateWishRequest;

  try {
    const data = await api.updateWish(body);
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
| **wishId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **ifMatch** | `string` | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header. | [Defaults to `undefined`] |
| **wishUpdate** | [WishUpdate](WishUpdate.md) |  | |

### Return type

[**WishDetail**](WishDetail.md)

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

