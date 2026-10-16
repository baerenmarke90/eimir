# PrivateAreaApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**createGiftIdea**](PrivateAreaApi.md#creategiftidea) | **POST** /api/v1/spaces/{spaceId}/private/gift-ideas | Create Gift Idea |
| [**createPrivateCollection**](PrivateAreaApi.md#createprivatecollection) | **POST** /api/v1/spaces/{spaceId}/private/collections | Create Private Collection |
| [**createPrivateCollectionItem**](PrivateAreaApi.md#createprivatecollectionitem) | **POST** /api/v1/spaces/{spaceId}/private/collections/{collectionId}/items | Create Private Collection Item |
| [**createPrivateNote**](PrivateAreaApi.md#createprivatenote) | **POST** /api/v1/spaces/{spaceId}/private/notes | Create Private Note |
| [**deleteGiftIdea**](PrivateAreaApi.md#deletegiftidea) | **DELETE** /api/v1/spaces/{spaceId}/private/gift-ideas/{giftIdeaId} | Delete Gift Idea |
| [**deletePrivateCollection**](PrivateAreaApi.md#deleteprivatecollection) | **DELETE** /api/v1/spaces/{spaceId}/private/collections/{collectionId} | Delete Private Collection |
| [**deletePrivateCollectionItem**](PrivateAreaApi.md#deleteprivatecollectionitem) | **DELETE** /api/v1/spaces/{spaceId}/private/collections/{collectionId}/items/{itemId} | Delete Private Collection Item |
| [**deletePrivateNote**](PrivateAreaApi.md#deleteprivatenote) | **DELETE** /api/v1/spaces/{spaceId}/private/notes/{noteId} | Delete Private Note |
| [**getGiftIdea**](PrivateAreaApi.md#getgiftidea) | **GET** /api/v1/spaces/{spaceId}/private/gift-ideas/{giftIdeaId} | Get Gift Idea |
| [**getPrivateCollection**](PrivateAreaApi.md#getprivatecollection) | **GET** /api/v1/spaces/{spaceId}/private/collections/{collectionId} | Get Private Collection |
| [**getPrivateCollectionItem**](PrivateAreaApi.md#getprivatecollectionitem) | **GET** /api/v1/spaces/{spaceId}/private/collections/{collectionId}/items/{itemId} | Get Private Collection Item |
| [**getPrivateNote**](PrivateAreaApi.md#getprivatenote) | **GET** /api/v1/spaces/{spaceId}/private/notes/{noteId} | Get Private Note |
| [**listGiftIdeas**](PrivateAreaApi.md#listgiftideas) | **GET** /api/v1/spaces/{spaceId}/private/gift-ideas | List Gift Ideas |
| [**listPrivateCollections**](PrivateAreaApi.md#listprivatecollections) | **GET** /api/v1/spaces/{spaceId}/private/collections | List Private Collections |
| [**listPrivateNotes**](PrivateAreaApi.md#listprivatenotes) | **GET** /api/v1/spaces/{spaceId}/private/notes | List Private Notes |
| [**reorderPrivateCollectionItems**](PrivateAreaApi.md#reorderprivatecollectionitems) | **PUT** /api/v1/spaces/{spaceId}/private/collections/{collectionId}/order | Reorder Private Collection Items |
| [**updateGiftIdea**](PrivateAreaApi.md#updategiftidea) | **PATCH** /api/v1/spaces/{spaceId}/private/gift-ideas/{giftIdeaId} | Update Gift Idea |
| [**updatePrivateCollection**](PrivateAreaApi.md#updateprivatecollection) | **PATCH** /api/v1/spaces/{spaceId}/private/collections/{collectionId} | Update Private Collection |
| [**updatePrivateCollectionItem**](PrivateAreaApi.md#updateprivatecollectionitem) | **PATCH** /api/v1/spaces/{spaceId}/private/collections/{collectionId}/items/{itemId} | Update Private Collection Item |
| [**updatePrivateNote**](PrivateAreaApi.md#updateprivatenote) | **PATCH** /api/v1/spaces/{spaceId}/private/notes/{noteId} | Update Private Note |



## createGiftIdea

> GiftIdeaDetail createGiftIdea(spaceId, giftIdeaCreate)

Create Gift Idea

### Example

```ts
import {
  Configuration,
  PrivateAreaApi,
} from '';
import type { CreateGiftIdeaRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PrivateAreaApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // GiftIdeaCreate
    giftIdeaCreate: ...,
  } satisfies CreateGiftIdeaRequest;

  try {
    const data = await api.createGiftIdea(body);
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
| **giftIdeaCreate** | [GiftIdeaCreate](GiftIdeaCreate.md) |  | |

### Return type

[**GiftIdeaDetail**](GiftIdeaDetail.md)

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


## createPrivateCollection

> PrivateCollectionDetail createPrivateCollection(spaceId, privateCollectionCreate)

Create Private Collection

### Example

```ts
import {
  Configuration,
  PrivateAreaApi,
} from '';
import type { CreatePrivateCollectionRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PrivateAreaApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // PrivateCollectionCreate
    privateCollectionCreate: ...,
  } satisfies CreatePrivateCollectionRequest;

  try {
    const data = await api.createPrivateCollection(body);
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
| **privateCollectionCreate** | [PrivateCollectionCreate](PrivateCollectionCreate.md) |  | |

### Return type

[**PrivateCollectionDetail**](PrivateCollectionDetail.md)

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


## createPrivateCollectionItem

> PrivateCollectionItemDetail createPrivateCollectionItem(collectionId, spaceId, privateCollectionItemCreate)

Create Private Collection Item

### Example

```ts
import {
  Configuration,
  PrivateAreaApi,
} from '';
import type { CreatePrivateCollectionItemRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PrivateAreaApi();

  const body = {
    // string
    collectionId: collectionId_example,
    // string
    spaceId: spaceId_example,
    // PrivateCollectionItemCreate
    privateCollectionItemCreate: ...,
  } satisfies CreatePrivateCollectionItemRequest;

  try {
    const data = await api.createPrivateCollectionItem(body);
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
| **privateCollectionItemCreate** | [PrivateCollectionItemCreate](PrivateCollectionItemCreate.md) |  | |

### Return type

[**PrivateCollectionItemDetail**](PrivateCollectionItemDetail.md)

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


## createPrivateNote

> PrivateNoteDetail createPrivateNote(spaceId, privateNoteCreate)

Create Private Note

### Example

```ts
import {
  Configuration,
  PrivateAreaApi,
} from '';
import type { CreatePrivateNoteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PrivateAreaApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // PrivateNoteCreate
    privateNoteCreate: ...,
  } satisfies CreatePrivateNoteRequest;

  try {
    const data = await api.createPrivateNote(body);
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
| **privateNoteCreate** | [PrivateNoteCreate](PrivateNoteCreate.md) |  | |

### Return type

[**PrivateNoteDetail**](PrivateNoteDetail.md)

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


## deleteGiftIdea

> deleteGiftIdea(giftIdeaId, spaceId, ifMatch)

Delete Gift Idea

### Example

```ts
import {
  Configuration,
  PrivateAreaApi,
} from '';
import type { DeleteGiftIdeaRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PrivateAreaApi();

  const body = {
    // string
    giftIdeaId: giftIdeaId_example,
    // string
    spaceId: spaceId_example,
    // string | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
  } satisfies DeleteGiftIdeaRequest;

  try {
    const data = await api.deleteGiftIdea(body);
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
| **giftIdeaId** | `string` |  | [Defaults to `undefined`] |
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


## deletePrivateCollection

> deletePrivateCollection(collectionId, spaceId, ifMatch)

Delete Private Collection

### Example

```ts
import {
  Configuration,
  PrivateAreaApi,
} from '';
import type { DeletePrivateCollectionRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PrivateAreaApi();

  const body = {
    // string
    collectionId: collectionId_example,
    // string
    spaceId: spaceId_example,
    // string | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
  } satisfies DeletePrivateCollectionRequest;

  try {
    const data = await api.deletePrivateCollection(body);
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


## deletePrivateCollectionItem

> deletePrivateCollectionItem(collectionId, itemId, spaceId, ifMatch)

Delete Private Collection Item

### Example

```ts
import {
  Configuration,
  PrivateAreaApi,
} from '';
import type { DeletePrivateCollectionItemRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PrivateAreaApi();

  const body = {
    // string
    collectionId: collectionId_example,
    // string
    itemId: itemId_example,
    // string
    spaceId: spaceId_example,
    // string | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
  } satisfies DeletePrivateCollectionItemRequest;

  try {
    const data = await api.deletePrivateCollectionItem(body);
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


## deletePrivateNote

> deletePrivateNote(noteId, spaceId, ifMatch)

Delete Private Note

### Example

```ts
import {
  Configuration,
  PrivateAreaApi,
} from '';
import type { DeletePrivateNoteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PrivateAreaApi();

  const body = {
    // string
    noteId: noteId_example,
    // string
    spaceId: spaceId_example,
    // string | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
  } satisfies DeletePrivateNoteRequest;

  try {
    const data = await api.deletePrivateNote(body);
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
| **noteId** | `string` |  | [Defaults to `undefined`] |
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


## getGiftIdea

> GiftIdeaDetail getGiftIdea(giftIdeaId, spaceId)

Get Gift Idea

### Example

```ts
import {
  Configuration,
  PrivateAreaApi,
} from '';
import type { GetGiftIdeaRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PrivateAreaApi();

  const body = {
    // string
    giftIdeaId: giftIdeaId_example,
    // string
    spaceId: spaceId_example,
  } satisfies GetGiftIdeaRequest;

  try {
    const data = await api.getGiftIdea(body);
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
| **giftIdeaId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**GiftIdeaDetail**](GiftIdeaDetail.md)

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


## getPrivateCollection

> PrivateCollectionDetail getPrivateCollection(collectionId, spaceId)

Get Private Collection

### Example

```ts
import {
  Configuration,
  PrivateAreaApi,
} from '';
import type { GetPrivateCollectionRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PrivateAreaApi();

  const body = {
    // string
    collectionId: collectionId_example,
    // string
    spaceId: spaceId_example,
  } satisfies GetPrivateCollectionRequest;

  try {
    const data = await api.getPrivateCollection(body);
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

[**PrivateCollectionDetail**](PrivateCollectionDetail.md)

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


## getPrivateCollectionItem

> PrivateCollectionItemDetail getPrivateCollectionItem(collectionId, itemId, spaceId)

Get Private Collection Item

### Example

```ts
import {
  Configuration,
  PrivateAreaApi,
} from '';
import type { GetPrivateCollectionItemRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PrivateAreaApi();

  const body = {
    // string
    collectionId: collectionId_example,
    // string
    itemId: itemId_example,
    // string
    spaceId: spaceId_example,
  } satisfies GetPrivateCollectionItemRequest;

  try {
    const data = await api.getPrivateCollectionItem(body);
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

### Return type

[**PrivateCollectionItemDetail**](PrivateCollectionItemDetail.md)

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


## getPrivateNote

> PrivateNoteDetail getPrivateNote(noteId, spaceId)

Get Private Note

### Example

```ts
import {
  Configuration,
  PrivateAreaApi,
} from '';
import type { GetPrivateNoteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PrivateAreaApi();

  const body = {
    // string
    noteId: noteId_example,
    // string
    spaceId: spaceId_example,
  } satisfies GetPrivateNoteRequest;

  try {
    const data = await api.getPrivateNote(body);
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
| **noteId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**PrivateNoteDetail**](PrivateNoteDetail.md)

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


## listGiftIdeas

> GiftIdeaPage listGiftIdeas(spaceId, cursor, limit)

List Gift Ideas

### Example

```ts
import {
  Configuration,
  PrivateAreaApi,
} from '';
import type { ListGiftIdeasRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PrivateAreaApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // string (optional)
    cursor: cursor_example,
    // number (optional)
    limit: 56,
  } satisfies ListGiftIdeasRequest;

  try {
    const data = await api.listGiftIdeas(body);
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

[**GiftIdeaPage**](GiftIdeaPage.md)

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


## listPrivateCollections

> PrivateCollectionPage listPrivateCollections(spaceId, cursor, limit)

List Private Collections

### Example

```ts
import {
  Configuration,
  PrivateAreaApi,
} from '';
import type { ListPrivateCollectionsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PrivateAreaApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // string (optional)
    cursor: cursor_example,
    // number (optional)
    limit: 56,
  } satisfies ListPrivateCollectionsRequest;

  try {
    const data = await api.listPrivateCollections(body);
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

[**PrivateCollectionPage**](PrivateCollectionPage.md)

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


## listPrivateNotes

> PrivateNotePage listPrivateNotes(spaceId, cursor, limit)

List Private Notes

### Example

```ts
import {
  Configuration,
  PrivateAreaApi,
} from '';
import type { ListPrivateNotesRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PrivateAreaApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // string (optional)
    cursor: cursor_example,
    // number (optional)
    limit: 56,
  } satisfies ListPrivateNotesRequest;

  try {
    const data = await api.listPrivateNotes(body);
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

[**PrivateNotePage**](PrivateNotePage.md)

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


## reorderPrivateCollectionItems

> PrivateCollectionDetail reorderPrivateCollectionItems(collectionId, spaceId, ifMatch, privateCollectionOrder)

Reorder Private Collection Items

### Example

```ts
import {
  Configuration,
  PrivateAreaApi,
} from '';
import type { ReorderPrivateCollectionItemsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PrivateAreaApi();

  const body = {
    // string
    collectionId: collectionId_example,
    // string
    spaceId: spaceId_example,
    // string | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
    // PrivateCollectionOrder
    privateCollectionOrder: ...,
  } satisfies ReorderPrivateCollectionItemsRequest;

  try {
    const data = await api.reorderPrivateCollectionItems(body);
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
| **privateCollectionOrder** | [PrivateCollectionOrder](PrivateCollectionOrder.md) |  | |

### Return type

[**PrivateCollectionDetail**](PrivateCollectionDetail.md)

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


## updateGiftIdea

> GiftIdeaDetail updateGiftIdea(giftIdeaId, spaceId, ifMatch, giftIdeaUpdate)

Update Gift Idea

### Example

```ts
import {
  Configuration,
  PrivateAreaApi,
} from '';
import type { UpdateGiftIdeaRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PrivateAreaApi();

  const body = {
    // string
    giftIdeaId: giftIdeaId_example,
    // string
    spaceId: spaceId_example,
    // string | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
    // GiftIdeaUpdate
    giftIdeaUpdate: ...,
  } satisfies UpdateGiftIdeaRequest;

  try {
    const data = await api.updateGiftIdea(body);
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
| **giftIdeaId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **ifMatch** | `string` | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header. | [Defaults to `undefined`] |
| **giftIdeaUpdate** | [GiftIdeaUpdate](GiftIdeaUpdate.md) |  | |

### Return type

[**GiftIdeaDetail**](GiftIdeaDetail.md)

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


## updatePrivateCollection

> PrivateCollectionDetail updatePrivateCollection(collectionId, spaceId, ifMatch, privateCollectionUpdate)

Update Private Collection

### Example

```ts
import {
  Configuration,
  PrivateAreaApi,
} from '';
import type { UpdatePrivateCollectionRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PrivateAreaApi();

  const body = {
    // string
    collectionId: collectionId_example,
    // string
    spaceId: spaceId_example,
    // string | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
    // PrivateCollectionUpdate
    privateCollectionUpdate: ...,
  } satisfies UpdatePrivateCollectionRequest;

  try {
    const data = await api.updatePrivateCollection(body);
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
| **privateCollectionUpdate** | [PrivateCollectionUpdate](PrivateCollectionUpdate.md) |  | |

### Return type

[**PrivateCollectionDetail**](PrivateCollectionDetail.md)

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


## updatePrivateCollectionItem

> PrivateCollectionItemDetail updatePrivateCollectionItem(collectionId, itemId, spaceId, ifMatch, privateCollectionItemUpdate)

Update Private Collection Item

### Example

```ts
import {
  Configuration,
  PrivateAreaApi,
} from '';
import type { UpdatePrivateCollectionItemRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PrivateAreaApi();

  const body = {
    // string
    collectionId: collectionId_example,
    // string
    itemId: itemId_example,
    // string
    spaceId: spaceId_example,
    // string | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
    // PrivateCollectionItemUpdate
    privateCollectionItemUpdate: ...,
  } satisfies UpdatePrivateCollectionItemRequest;

  try {
    const data = await api.updatePrivateCollectionItem(body);
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
| **privateCollectionItemUpdate** | [PrivateCollectionItemUpdate](PrivateCollectionItemUpdate.md) |  | |

### Return type

[**PrivateCollectionItemDetail**](PrivateCollectionItemDetail.md)

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


## updatePrivateNote

> PrivateNoteDetail updatePrivateNote(noteId, spaceId, ifMatch, privateNoteUpdate)

Update Private Note

### Example

```ts
import {
  Configuration,
  PrivateAreaApi,
} from '';
import type { UpdatePrivateNoteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PrivateAreaApi();

  const body = {
    // string
    noteId: noteId_example,
    // string
    spaceId: spaceId_example,
    // string | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
    // PrivateNoteUpdate
    privateNoteUpdate: ...,
  } satisfies UpdatePrivateNoteRequest;

  try {
    const data = await api.updatePrivateNote(body);
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
| **noteId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **ifMatch** | `string` | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header. | [Defaults to `undefined`] |
| **privateNoteUpdate** | [PrivateNoteUpdate](PrivateNoteUpdate.md) |  | |

### Return type

[**PrivateNoteDetail**](PrivateNoteDetail.md)

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

