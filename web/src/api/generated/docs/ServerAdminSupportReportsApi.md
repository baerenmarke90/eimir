# ServerAdminSupportReportsApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**getSupportReport**](ServerAdminSupportReportsApi.md#getsupportreport) | **GET** /api/v1/server-admin/support-reports/{reportId} | Get Support Report |
| [**listSupportReports**](ServerAdminSupportReportsApi.md#listsupportreports) | **GET** /api/v1/server-admin/support-reports | List Support Reports |
| [**replyToSupportReport**](ServerAdminSupportReportsApi.md#replytosupportreport) | **POST** /api/v1/server-admin/support-reports/{reportId}/reply | Reply To Support Report |
| [**setSupportReportState**](ServerAdminSupportReportsApi.md#setsupportreportstate) | **PUT** /api/v1/server-admin/support-reports/{reportId}/state | Set Support Report State |



## getSupportReport

> SupportReportDetailView getSupportReport(reportId)

Get Support Report

Return one report in full; the reporter is the opaque account id only.

### Example

```ts
import {
  Configuration,
  ServerAdminSupportReportsApi,
} from '';
import type { GetSupportReportRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ServerAdminSupportReportsApi();

  const body = {
    // string
    reportId: reportId_example,
  } satisfies GetSupportReportRequest;

  try {
    const data = await api.getSupportReport(body);
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
| **reportId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**SupportReportDetailView**](SupportReportDetailView.md)

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
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## listSupportReports

> SupportReportListView listSupportReports(state, limit, cursor)

List Support Reports

List reports newest first without note text; the cursor is bound to the state filter.

### Example

```ts
import {
  Configuration,
  ServerAdminSupportReportsApi,
} from '';
import type { ListSupportReportsRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ServerAdminSupportReportsApi();

  const body = {
    // SupportReportState (optional)
    state: ...,
    // number (optional)
    limit: 56,
    // string (optional)
    cursor: cursor_example,
  } satisfies ListSupportReportsRequest;

  try {
    const data = await api.listSupportReports(body);
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
| **state** | `SupportReportState` |  | [Optional] [Defaults to `undefined`] [Enum: NEW, IN_PROGRESS, CLOSED] |
| **limit** | `number` |  | [Optional] [Defaults to `50`] |
| **cursor** | `string` |  | [Optional] [Defaults to `undefined`] |

### Return type

[**SupportReportListView**](SupportReportListView.md)

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
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## replyToSupportReport

> SupportReportDetailView replyToSupportReport(reportId, supportReportReplyCreate)

Reply To Support Report

Send the single reply of at most 500 characters. Needs recent authentication.

### Example

```ts
import {
  Configuration,
  ServerAdminSupportReportsApi,
} from '';
import type { ReplyToSupportReportRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ServerAdminSupportReportsApi();

  const body = {
    // string
    reportId: reportId_example,
    // SupportReportReplyCreate
    supportReportReplyCreate: ...,
  } satisfies ReplyToSupportReportRequest;

  try {
    const data = await api.replyToSupportReport(body);
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
| **reportId** | `string` |  | [Defaults to `undefined`] |
| **supportReportReplyCreate** | [SupportReportReplyCreate](SupportReportReplyCreate.md) |  | |

### Return type

[**SupportReportDetailView**](SupportReportDetailView.md)

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
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## setSupportReportState

> SupportReportDetailView setSupportReportState(reportId, supportReportStateUpdate)

Set Support Report State

Set the triage marker of a report. Needs recent authentication.

### Example

```ts
import {
  Configuration,
  ServerAdminSupportReportsApi,
} from '';
import type { SetSupportReportStateRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ServerAdminSupportReportsApi();

  const body = {
    // string
    reportId: reportId_example,
    // SupportReportStateUpdate
    supportReportStateUpdate: ...,
  } satisfies SetSupportReportStateRequest;

  try {
    const data = await api.setSupportReportState(body);
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
| **reportId** | `string` |  | [Defaults to `undefined`] |
| **supportReportStateUpdate** | [SupportReportStateUpdate](SupportReportStateUpdate.md) |  | |

### Return type

[**SupportReportDetailView**](SupportReportDetailView.md)

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
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

