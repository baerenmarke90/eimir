# PlacesApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**createPlace**](PlacesApi.md#createplace) | **POST** /api/v1/spaces/{spaceId}/places | Create Place |
| [**deletePlace**](PlacesApi.md#deleteplace) | **DELETE** /api/v1/spaces/{spaceId}/places/{placeId} | Delete Place |
| [**getPlace**](PlacesApi.md#getplace) | **GET** /api/v1/spaces/{spaceId}/places/{placeId} | Get Place |
| [**listPlaces**](PlacesApi.md#listplaces) | **GET** /api/v1/spaces/{spaceId}/places | List Places |
| [**updatePlace**](PlacesApi.md#updateplace) | **PATCH** /api/v1/spaces/{spaceId}/places/{placeId} | Update Place |



## createPlace

> PlaceDetail createPlace(spaceId, placeCreate)

Create Place

### Example

```ts
import {
  Configuration,
  PlacesApi,
} from '';
import type { CreatePlaceRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PlacesApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // PlaceCreate
    placeCreate: ...,
  } satisfies CreatePlaceRequest;

  try {
    const data = await api.createPlace(body);
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
| **placeCreate** | [PlaceCreate](PlaceCreate.md) |  | |

### Return type

[**PlaceDetail**](PlaceDetail.md)

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
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## deletePlace

> deletePlace(placeId, spaceId, ifMatch)

Delete Place

### Example

```ts
import {
  Configuration,
  PlacesApi,
} from '';
import type { DeletePlaceRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PlacesApi();

  const body = {
    // string
    placeId: placeId_example,
    // string
    spaceId: spaceId_example,
    // string | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
  } satisfies DeletePlaceRequest;

  try {
    const data = await api.deletePlace(body);
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
| **placeId** | `string` |  | [Defaults to `undefined`] |
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


## getPlace

> PlaceDetail getPlace(placeId, spaceId)

Get Place

### Example

```ts
import {
  Configuration,
  PlacesApi,
} from '';
import type { GetPlaceRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PlacesApi();

  const body = {
    // string
    placeId: placeId_example,
    // string
    spaceId: spaceId_example,
  } satisfies GetPlaceRequest;

  try {
    const data = await api.getPlace(body);
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
| **placeId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**PlaceDetail**](PlaceDetail.md)

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


## listPlaces

> PlacePage listPlaces(spaceId, cursor, limit)

List Places

### Example

```ts
import {
  Configuration,
  PlacesApi,
} from '';
import type { ListPlacesRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PlacesApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // string (optional)
    cursor: cursor_example,
    // number (optional)
    limit: 56,
  } satisfies ListPlacesRequest;

  try {
    const data = await api.listPlaces(body);
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

### Return type

[**PlacePage**](PlacePage.md)

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


## updatePlace

> PlaceDetail updatePlace(placeId, spaceId, ifMatch, placeUpdate)

Update Place

### Example

```ts
import {
  Configuration,
  PlacesApi,
} from '';
import type { UpdatePlaceRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PlacesApi();

  const body = {
    // string
    placeId: placeId_example,
    // string
    spaceId: spaceId_example,
    // string | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
    // PlaceUpdate
    placeUpdate: ...,
  } satisfies UpdatePlaceRequest;

  try {
    const data = await api.updatePlace(body);
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
| **placeId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **ifMatch** | `string` | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header. | [Defaults to `undefined`] |
| **placeUpdate** | [PlaceUpdate](PlaceUpdate.md) |  | |

### Return type

[**PlaceDetail**](PlaceDetail.md)

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

