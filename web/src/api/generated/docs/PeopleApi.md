# PeopleApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**createImportantDateApiV1SpacesSpaceIdImportantDatesPost**](PeopleApi.md#createimportantdateapiv1spacesspaceidimportantdatespost) | **POST** /api/v1/spaces/{spaceId}/important-dates | Create Important Date |
| [**createRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPost**](PeopleApi.md#createrelatedpersonapiv1spacesspaceidrelatedpersonspost) | **POST** /api/v1/spaces/{spaceId}/related-persons | Create Related Person |
| [**deleteImportantDateApiV1SpacesSpaceIdImportantDatesDateIdDelete**](PeopleApi.md#deleteimportantdateapiv1spacesspaceidimportantdatesdateiddelete) | **DELETE** /api/v1/spaces/{spaceId}/important-dates/{dateId} | Delete Important Date |
| [**deleteRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPersonIdDelete**](PeopleApi.md#deleterelatedpersonapiv1spacesspaceidrelatedpersonspersoniddelete) | **DELETE** /api/v1/spaces/{spaceId}/related-persons/{personId} | Delete Related Person |
| [**getImportantDateApiV1SpacesSpaceIdImportantDatesDateIdGet**](PeopleApi.md#getimportantdateapiv1spacesspaceidimportantdatesdateidget) | **GET** /api/v1/spaces/{spaceId}/important-dates/{dateId} | Get Important Date |
| [**getRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPersonIdGet**](PeopleApi.md#getrelatedpersonapiv1spacesspaceidrelatedpersonspersonidget) | **GET** /api/v1/spaces/{spaceId}/related-persons/{personId} | Get Related Person |
| [**listImportantDatesApiV1SpacesSpaceIdImportantDatesGet**](PeopleApi.md#listimportantdatesapiv1spacesspaceidimportantdatesget) | **GET** /api/v1/spaces/{spaceId}/important-dates | List Important Dates |
| [**listRelatedPersonsApiV1SpacesSpaceIdRelatedPersonsGet**](PeopleApi.md#listrelatedpersonsapiv1spacesspaceidrelatedpersonsget) | **GET** /api/v1/spaces/{spaceId}/related-persons | List Related Persons |
| [**updateImportantDateApiV1SpacesSpaceIdImportantDatesDateIdPut**](PeopleApi.md#updateimportantdateapiv1spacesspaceidimportantdatesdateidput) | **PUT** /api/v1/spaces/{spaceId}/important-dates/{dateId} | Update Important Date |
| [**updateRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPersonIdPut**](PeopleApi.md#updaterelatedpersonapiv1spacesspaceidrelatedpersonspersonidput) | **PUT** /api/v1/spaces/{spaceId}/related-persons/{personId} | Update Related Person |



## createImportantDateApiV1SpacesSpaceIdImportantDatesPost

> ImportantDateView createImportantDateApiV1SpacesSpaceIdImportantDatesPost(spaceId, importantDateFields)

Create Important Date

### Example

```ts
import {
  Configuration,
  PeopleApi,
} from '';
import type { CreateImportantDateApiV1SpacesSpaceIdImportantDatesPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PeopleApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // ImportantDateFields
    importantDateFields: ...,
  } satisfies CreateImportantDateApiV1SpacesSpaceIdImportantDatesPostRequest;

  try {
    const data = await api.createImportantDateApiV1SpacesSpaceIdImportantDatesPost(body);
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
| **importantDateFields** | [ImportantDateFields](ImportantDateFields.md) |  | |

### Return type

[**ImportantDateView**](ImportantDateView.md)

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


## createRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPost

> RelatedPersonView createRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPost(spaceId, relatedPersonFields)

Create Related Person

### Example

```ts
import {
  Configuration,
  PeopleApi,
} from '';
import type { CreateRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PeopleApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // RelatedPersonFields
    relatedPersonFields: ...,
  } satisfies CreateRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPostRequest;

  try {
    const data = await api.createRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPost(body);
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
| **relatedPersonFields** | [RelatedPersonFields](RelatedPersonFields.md) |  | |

### Return type

[**RelatedPersonView**](RelatedPersonView.md)

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


## deleteImportantDateApiV1SpacesSpaceIdImportantDatesDateIdDelete

> deleteImportantDateApiV1SpacesSpaceIdImportantDatesDateIdDelete(dateId, spaceId, ifMatch)

Delete Important Date

### Example

```ts
import {
  Configuration,
  PeopleApi,
} from '';
import type { DeleteImportantDateApiV1SpacesSpaceIdImportantDatesDateIdDeleteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PeopleApi();

  const body = {
    // string
    dateId: dateId_example,
    // string
    spaceId: spaceId_example,
    // string | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
  } satisfies DeleteImportantDateApiV1SpacesSpaceIdImportantDatesDateIdDeleteRequest;

  try {
    const data = await api.deleteImportantDateApiV1SpacesSpaceIdImportantDatesDateIdDelete(body);
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
| **dateId** | `string` |  | [Defaults to `undefined`] |
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
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## deleteRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPersonIdDelete

> deleteRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPersonIdDelete(personId, spaceId, deletePolicy, ifMatch)

Delete Related Person

### Example

```ts
import {
  Configuration,
  PeopleApi,
} from '';
import type { DeleteRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPersonIdDeleteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PeopleApi();

  const body = {
    // string
    personId: personId_example,
    // string
    spaceId: spaceId_example,
    // RelatedPersonDeletePolicy | Explicit handling of linked dates: preserve removes only the person link; cascade deletes all linked dates.
    deletePolicy: ...,
    // string | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
  } satisfies DeleteRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPersonIdDeleteRequest;

  try {
    const data = await api.deleteRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPersonIdDelete(body);
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
| **personId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **deletePolicy** | `RelatedPersonDeletePolicy` | Explicit handling of linked dates: preserve removes only the person link; cascade deletes all linked dates. | [Defaults to `undefined`] [Enum: preserve, cascade] |
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
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getImportantDateApiV1SpacesSpaceIdImportantDatesDateIdGet

> ImportantDateView getImportantDateApiV1SpacesSpaceIdImportantDatesDateIdGet(dateId, spaceId)

Get Important Date

### Example

```ts
import {
  Configuration,
  PeopleApi,
} from '';
import type { GetImportantDateApiV1SpacesSpaceIdImportantDatesDateIdGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PeopleApi();

  const body = {
    // string
    dateId: dateId_example,
    // string
    spaceId: spaceId_example,
  } satisfies GetImportantDateApiV1SpacesSpaceIdImportantDatesDateIdGetRequest;

  try {
    const data = await api.getImportantDateApiV1SpacesSpaceIdImportantDatesDateIdGet(body);
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
| **dateId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**ImportantDateView**](ImportantDateView.md)

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


## getRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPersonIdGet

> RelatedPersonView getRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPersonIdGet(personId, spaceId)

Get Related Person

### Example

```ts
import {
  Configuration,
  PeopleApi,
} from '';
import type { GetRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPersonIdGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PeopleApi();

  const body = {
    // string
    personId: personId_example,
    // string
    spaceId: spaceId_example,
  } satisfies GetRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPersonIdGetRequest;

  try {
    const data = await api.getRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPersonIdGet(body);
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
| **personId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**RelatedPersonView**](RelatedPersonView.md)

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


## listImportantDatesApiV1SpacesSpaceIdImportantDatesGet

> Array&lt;ImportantDateView&gt; listImportantDatesApiV1SpacesSpaceIdImportantDatesGet(spaceId, relatedPersonId)

List Important Dates

### Example

```ts
import {
  Configuration,
  PeopleApi,
} from '';
import type { ListImportantDatesApiV1SpacesSpaceIdImportantDatesGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PeopleApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // string (optional)
    relatedPersonId: relatedPersonId_example,
  } satisfies ListImportantDatesApiV1SpacesSpaceIdImportantDatesGetRequest;

  try {
    const data = await api.listImportantDatesApiV1SpacesSpaceIdImportantDatesGet(body);
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
| **relatedPersonId** | `string` |  | [Optional] [Defaults to `undefined`] |

### Return type

[**Array&lt;ImportantDateView&gt;**](ImportantDateView.md)

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


## listRelatedPersonsApiV1SpacesSpaceIdRelatedPersonsGet

> Array&lt;RelatedPersonView&gt; listRelatedPersonsApiV1SpacesSpaceIdRelatedPersonsGet(spaceId)

List Related Persons

### Example

```ts
import {
  Configuration,
  PeopleApi,
} from '';
import type { ListRelatedPersonsApiV1SpacesSpaceIdRelatedPersonsGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PeopleApi();

  const body = {
    // string
    spaceId: spaceId_example,
  } satisfies ListRelatedPersonsApiV1SpacesSpaceIdRelatedPersonsGetRequest;

  try {
    const data = await api.listRelatedPersonsApiV1SpacesSpaceIdRelatedPersonsGet(body);
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

[**Array&lt;RelatedPersonView&gt;**](RelatedPersonView.md)

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


## updateImportantDateApiV1SpacesSpaceIdImportantDatesDateIdPut

> ImportantDateView updateImportantDateApiV1SpacesSpaceIdImportantDatesDateIdPut(dateId, spaceId, ifMatch, importantDateFields)

Update Important Date

### Example

```ts
import {
  Configuration,
  PeopleApi,
} from '';
import type { UpdateImportantDateApiV1SpacesSpaceIdImportantDatesDateIdPutRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PeopleApi();

  const body = {
    // string
    dateId: dateId_example,
    // string
    spaceId: spaceId_example,
    // string | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
    // ImportantDateFields
    importantDateFields: ...,
  } satisfies UpdateImportantDateApiV1SpacesSpaceIdImportantDatesDateIdPutRequest;

  try {
    const data = await api.updateImportantDateApiV1SpacesSpaceIdImportantDatesDateIdPut(body);
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
| **dateId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **ifMatch** | `string` | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header. | [Defaults to `undefined`] |
| **importantDateFields** | [ImportantDateFields](ImportantDateFields.md) |  | |

### Return type

[**ImportantDateView**](ImportantDateView.md)

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
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## updateRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPersonIdPut

> RelatedPersonView updateRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPersonIdPut(personId, spaceId, ifMatch, relatedPersonFields)

Update Related Person

### Example

```ts
import {
  Configuration,
  PeopleApi,
} from '';
import type { UpdateRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPersonIdPutRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new PeopleApi();

  const body = {
    // string
    personId: personId_example,
    // string
    spaceId: spaceId_example,
    // string | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header.
    ifMatch: ifMatch_example,
    // RelatedPersonFields
    relatedPersonFields: ...,
  } satisfies UpdateRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPersonIdPutRequest;

  try {
    const data = await api.updateRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPersonIdPut(body);
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
| **personId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |
| **ifMatch** | `string` | The last-read resource version, encoded as a strong ETag. Writes are rejected without this header. | [Defaults to `undefined`] |
| **relatedPersonFields** | [RelatedPersonFields](RelatedPersonFields.md) |  | |

### Return type

[**RelatedPersonView**](RelatedPersonView.md)

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
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

