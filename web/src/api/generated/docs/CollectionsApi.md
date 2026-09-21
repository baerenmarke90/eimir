# CollectionsApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**createCollection**](CollectionsApi.md#createcollection) | **POST** /api/v1/spaces/{spaceId}/collections | Create Collection |
| [**createCollectionItem**](CollectionsApi.md#createcollectionitem) | **POST** /api/v1/spaces/{spaceId}/collections/{collectionId}/items | Create Collection Item |
| [**deleteCollection**](CollectionsApi.md#deletecollection) | **DELETE** /api/v1/spaces/{spaceId}/collections/{collectionId} | Delete Collection |
| [**deleteCollectionItem**](CollectionsApi.md#deletecollectionitem) | **DELETE** /api/v1/spaces/{spaceId}/collections/{collectionId}/items/{itemId} | Delete Collection Item |
| [**getCollection**](CollectionsApi.md#getcollection) | **GET** /api/v1/spaces/{spaceId}/collections/{collectionId} | Get Collection |
| [**listCollections**](CollectionsApi.md#listcollections) | **GET** /api/v1/spaces/{spaceId}/collections | List Collections |
| [**reorderCollectionItems**](CollectionsApi.md#reordercollectionitems) | **PUT** /api/v1/spaces/{spaceId}/collections/{collectionId}/order | Reorder Collection Items |
| [**updateCollection**](CollectionsApi.md#updatecollection) | **PATCH** /api/v1/spaces/{spaceId}/collections/{collectionId} | Update Collection |
| [**updateCollectionItem**](CollectionsApi.md#updatecollectionitem) | **PATCH** /api/v1/spaces/{spaceId}/collections/{collectionId}/items/{itemId} | Update Collection Item |



## createCollection

> CollectionDetail createCollection(spaceId, collectionCreate)

Create Collection

### Example

```ts
import {
  Configuration,
  CollectionsApi,
} from '';
import type { CreateCollectionRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new CollectionsApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // CollectionCreate
    collectionCreate: ...,
  } satisfies CreateCollectionRequest;

  try {
    const data = await api.createCollection(body);
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
| **collectionCreate** | [CollectionCreate](CollectionCreate.md) |  | |

### Return type

[**CollectionDetail**](CollectionDetail.md)

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


## createCollectionItem

> CollectionItemDetail createCollectionItem(collectionId, spaceId, collectionItemCreate)

Create Collection Item

### Example

```ts
import {
  Configuration,
  CollectionsApi,
} from '';
import type { CreateCollectionItemRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new CollectionsApi();

  const body = {
    // string
    collectionId: collectionId_example,
    // string
    spaceId: spaceId_example,
    // CollectionItemCreate
    collectionItemCreate: ...,
  } satisfies CreateCollectionItemRequest;

  try {
    const data = await api.createCollectionItem(body);
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
| **collectionId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **collectionItemCreate** | [CollectionItemCreate](CollectionItemCreate.md) |  | |

### Return type

[**CollectionItemDetail**](CollectionItemDetail.md)

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


## deleteCollection

> deleteCollection(collectionId, spaceId, ifMatch)

Delete Collection

### Example

```ts
import {
  Configuration,
  CollectionsApi,
} from '';
import type { DeleteCollectionRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new CollectionsApi();

  const body = {
    // string
    collectionId: collectionId_example,
    // string
    spaceId: spaceId_example,
    // string | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
  } satisfies DeleteCollectionRequest;

  try {
    const data = await api.deleteCollection(body);
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
| **collectionId** | `string` |  | [Defaults to `undefined`] |
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


## deleteCollectionItem

> deleteCollectionItem(collectionId, itemId, spaceId, ifMatch)

Delete Collection Item

### Example

```ts
import {
  Configuration,
  CollectionsApi,
} from '';
import type { DeleteCollectionItemRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new CollectionsApi();

  const body = {
    // string
    collectionId: collectionId_example,
    // string
    itemId: itemId_example,
    // string
    spaceId: spaceId_example,
    // string | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
  } satisfies DeleteCollectionItemRequest;

  try {
    const data = await api.deleteCollectionItem(body);
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
| **collectionId** | `string` |  | [Defaults to `undefined`] |
| **itemId** | `string` |  | [Defaults to `undefined`] |
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


## getCollection

> CollectionDetail getCollection(collectionId, spaceId)

Get Collection

### Example

```ts
import {
  Configuration,
  CollectionsApi,
} from '';
import type { GetCollectionRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new CollectionsApi();

  const body = {
    // string
    collectionId: collectionId_example,
    // string
    spaceId: spaceId_example,
  } satisfies GetCollectionRequest;

  try {
    const data = await api.getCollection(body);
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
| **collectionId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**CollectionDetail**](CollectionDetail.md)

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


## listCollections

> CollectionPage listCollections(spaceId, cursor, limit)

List Collections

### Example

```ts
import {
  Configuration,
  CollectionsApi,
} from '';
import type { ListCollectionsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new CollectionsApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // string (optional)
    cursor: cursor_example,
    // number (optional)
    limit: 56,
  } satisfies ListCollectionsRequest;

  try {
    const data = await api.listCollections(body);
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

[**CollectionPage**](CollectionPage.md)

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


## reorderCollectionItems

> CollectionDetail reorderCollectionItems(collectionId, spaceId, ifMatch, collectionOrder)

Reorder Collection Items

### Example

```ts
import {
  Configuration,
  CollectionsApi,
} from '';
import type { ReorderCollectionItemsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new CollectionsApi();

  const body = {
    // string
    collectionId: collectionId_example,
    // string
    spaceId: spaceId_example,
    // string | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
    // CollectionOrder
    collectionOrder: ...,
  } satisfies ReorderCollectionItemsRequest;

  try {
    const data = await api.reorderCollectionItems(body);
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
| **collectionId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **ifMatch** | `string` | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header. | [Defaults to `undefined`] |
| **collectionOrder** | [CollectionOrder](CollectionOrder.md) |  | |

### Return type

[**CollectionDetail**](CollectionDetail.md)

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


## updateCollection

> CollectionDetail updateCollection(collectionId, spaceId, ifMatch, collectionUpdate)

Update Collection

### Example

```ts
import {
  Configuration,
  CollectionsApi,
} from '';
import type { UpdateCollectionRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new CollectionsApi();

  const body = {
    // string
    collectionId: collectionId_example,
    // string
    spaceId: spaceId_example,
    // string | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
    // CollectionUpdate
    collectionUpdate: ...,
  } satisfies UpdateCollectionRequest;

  try {
    const data = await api.updateCollection(body);
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
| **collectionId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **ifMatch** | `string` | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header. | [Defaults to `undefined`] |
| **collectionUpdate** | [CollectionUpdate](CollectionUpdate.md) |  | |

### Return type

[**CollectionDetail**](CollectionDetail.md)

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


## updateCollectionItem

> CollectionItemDetail updateCollectionItem(collectionId, itemId, spaceId, ifMatch, collectionItemUpdate)

Update Collection Item

### Example

```ts
import {
  Configuration,
  CollectionsApi,
} from '';
import type { UpdateCollectionItemRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new CollectionsApi();

  const body = {
    // string
    collectionId: collectionId_example,
    // string
    itemId: itemId_example,
    // string
    spaceId: spaceId_example,
    // string | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
    // CollectionItemUpdate
    collectionItemUpdate: ...,
  } satisfies UpdateCollectionItemRequest;

  try {
    const data = await api.updateCollectionItem(body);
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
| **collectionId** | `string` |  | [Defaults to `undefined`] |
| **itemId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **ifMatch** | `string` | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header. | [Defaults to `undefined`] |
| **collectionItemUpdate** | [CollectionItemUpdate](CollectionItemUpdate.md) |  | |

### Return type

[**CollectionItemDetail**](CollectionItemDetail.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  * ETag - Resource version to use for the next If-Match write request. <br>  * X-Eimir-Collection-Completion-Transition - True only when this successful Item update caused the shared Collection to transition from incomplete to complete; false otherwise. <br>  * X-Eimir-Shared-Achievement - Present only when the server confirms an enabled Shared Achievement for the successful domain completion. <br>  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

