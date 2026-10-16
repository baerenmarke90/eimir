# TransferApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**applyTransferImport**](TransferApi.md#applytransferimport) | **POST** /api/v1/spaces/{spaceId}/transfer/imports/{importId}/apply | Apply Transfer Import |
| [**createTransferExport**](TransferApi.md#createtransferexport) | **POST** /api/v1/spaces/{spaceId}/transfer/exports | Create Transfer Export |
| [**createTransferImport**](TransferApi.md#createtransferimport) | **POST** /api/v1/spaces/{spaceId}/transfer/imports | Create Transfer Import |
| [**downloadTransferExport**](TransferApi.md#downloadtransferexport) | **GET** /api/v1/spaces/{spaceId}/transfer/exports/{exportId}/download | Download Transfer Export |
| [**getTransferExport**](TransferApi.md#gettransferexport) | **GET** /api/v1/spaces/{spaceId}/transfer/exports/{exportId} | Get Transfer Export |
| [**getTransferImport**](TransferApi.md#gettransferimport) | **GET** /api/v1/spaces/{spaceId}/transfer/imports/{importId} | Get Transfer Import |



## applyTransferImport

> TransferImportDetail applyTransferImport(importId, spaceId)

Apply Transfer Import

### Example

```ts
import {
  Configuration,
  TransferApi,
} from '';
import type { ApplyTransferImportRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new TransferApi();

  const body = {
    // string
    importId: importId_example,
    // string
    spaceId: spaceId_example,
  } satisfies ApplyTransferImportRequest;

  try {
    const data = await api.applyTransferImport(body);
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
| **importId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**TransferImportDetail**](TransferImportDetail.md)

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
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## createTransferExport

> TransferExportDetail createTransferExport(spaceId, transferExportCreate)

Create Transfer Export

### Example

```ts
import {
  Configuration,
  TransferApi,
} from '';
import type { CreateTransferExportRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new TransferApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // TransferExportCreate
    transferExportCreate: ...,
  } satisfies CreateTransferExportRequest;

  try {
    const data = await api.createTransferExport(body);
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
| **transferExportCreate** | [TransferExportCreate](TransferExportCreate.md) |  | |

### Return type

[**TransferExportDetail**](TransferExportDetail.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **202** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## createTransferImport

> TransferImportDetail createTransferImport(spaceId, body)

Create Transfer Import

### Example

```ts
import {
  Configuration,
  TransferApi,
} from '';
import type { CreateTransferImportRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new TransferApi();

  const body = {
    // string
    spaceId: spaceId_example,
    // Blob
    body: BINARY_DATA_HERE,
  } satisfies CreateTransferImportRequest;

  try {
    const data = await api.createTransferImport(body);
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
| **body** | `Blob` |  | |

### Return type

[**TransferImportDetail**](TransferImportDetail.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/zip`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **202** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **413** | The content exceeds the server-side size limit. |  -  |
| **415** | The media type is not on the allowlist. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## downloadTransferExport

> Blob downloadTransferExport(exportId, spaceId)

Download Transfer Export

### Example

```ts
import {
  Configuration,
  TransferApi,
} from '';
import type { DownloadTransferExportRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new TransferApi();

  const body = {
    // string
    exportId: exportId_example,
    // string
    spaceId: spaceId_example,
  } satisfies DownloadTransferExportRequest;

  try {
    const data = await api.downloadTransferExport(body);
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
| **exportId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

**Blob**

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/zip`, `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Authorized Transfer Bundle download. |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getTransferExport

> TransferExportDetail getTransferExport(exportId, spaceId)

Get Transfer Export

### Example

```ts
import {
  Configuration,
  TransferApi,
} from '';
import type { GetTransferExportRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new TransferApi();

  const body = {
    // string
    exportId: exportId_example,
    // string
    spaceId: spaceId_example,
  } satisfies GetTransferExportRequest;

  try {
    const data = await api.getTransferExport(body);
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
| **exportId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**TransferExportDetail**](TransferExportDetail.md)

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


## getTransferImport

> TransferImportDetail getTransferImport(importId, spaceId)

Get Transfer Import

### Example

```ts
import {
  Configuration,
  TransferApi,
} from '';
import type { GetTransferImportRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new TransferApi();

  const body = {
    // string
    importId: importId_example,
    // string
    spaceId: spaceId_example,
  } satisfies GetTransferImportRequest;

  try {
    const data = await api.getTransferImport(body);
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
| **importId** | `string` |  | [Defaults to `undefined`] |
| **spaceId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**TransferImportDetail**](TransferImportDetail.md)

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

