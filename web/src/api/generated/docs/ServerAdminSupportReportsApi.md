# ServerAdminSupportReportsApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**clearSupportReportTicket**](ServerAdminSupportReportsApi.md#clearsupportreportticket) | **DELETE** /api/v1/server-admin/support-reports/{reportId}/ticket | Clear Support Report Ticket |
| [**createSupportReplyTemplate**](ServerAdminSupportReportsApi.md#createsupportreplytemplate) | **POST** /api/v1/server-admin/support-reports/templates | Create Support Reply Template |
| [**createSupportReportTicket**](ServerAdminSupportReportsApi.md#createsupportreportticket) | **POST** /api/v1/server-admin/support-reports/{reportId}/ticket | Create Support Report Ticket |
| [**deleteSupportReplyTemplate**](ServerAdminSupportReportsApi.md#deletesupportreplytemplate) | **DELETE** /api/v1/server-admin/support-reports/templates/{templateId} | Delete Support Reply Template |
| [**deleteSupportReport**](ServerAdminSupportReportsApi.md#deletesupportreport) | **DELETE** /api/v1/server-admin/support-reports/{reportId} | Delete Support Report |
| [**getSupportReport**](ServerAdminSupportReportsApi.md#getsupportreport) | **GET** /api/v1/server-admin/support-reports/{reportId} | Get Support Report |
| [**listSupportReplyTemplates**](ServerAdminSupportReportsApi.md#listsupportreplytemplates) | **GET** /api/v1/server-admin/support-reports/templates | List Support Reply Templates |
| [**listSupportReports**](ServerAdminSupportReportsApi.md#listsupportreports) | **GET** /api/v1/server-admin/support-reports | List Support Reports |
| [**replyToSupportReport**](ServerAdminSupportReportsApi.md#replytosupportreport) | **POST** /api/v1/server-admin/support-reports/{reportId}/reply | Reply To Support Report |
| [**setSupportReportArchived**](ServerAdminSupportReportsApi.md#setsupportreportarchived) | **PUT** /api/v1/server-admin/support-reports/{reportId}/archive | Set Support Report Archived |
| [**setSupportReportState**](ServerAdminSupportReportsApi.md#setsupportreportstate) | **PUT** /api/v1/server-admin/support-reports/{reportId}/state | Set Support Report State |
| [**updateSupportReplyTemplate**](ServerAdminSupportReportsApi.md#updatesupportreplytemplate) | **PUT** /api/v1/server-admin/support-reports/templates/{templateId} | Update Support Reply Template |



## clearSupportReportTicket

> clearSupportReportTicket(reportId)

Clear Support Report Ticket

Forget the ticket link so a new ticket can be created. Needs recent authentication.

### Example

```ts
import {
  Configuration,
  ServerAdminSupportReportsApi,
} from '';
import type { ClearSupportReportTicketRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ServerAdminSupportReportsApi();

  const body = {
    // string
    reportId: reportId_example,
  } satisfies ClearSupportReportTicketRequest;

  try {
    const data = await api.clearSupportReportTicket(body);
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

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## createSupportReplyTemplate

> SupportReplyTemplateView createSupportReplyTemplate(supportReplyTemplateWrite)

Create Support Reply Template

Create a template; at most 30 exist and names are unique regardless of case.

### Example

```ts
import {
  Configuration,
  ServerAdminSupportReportsApi,
} from '';
import type { CreateSupportReplyTemplateRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ServerAdminSupportReportsApi();

  const body = {
    // SupportReplyTemplateWrite
    supportReplyTemplateWrite: ...,
  } satisfies CreateSupportReplyTemplateRequest;

  try {
    const data = await api.createSupportReplyTemplate(body);
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
| **supportReplyTemplateWrite** | [SupportReplyTemplateWrite](SupportReplyTemplateWrite.md) |  | |

### Return type

[**SupportReplyTemplateView**](SupportReplyTemplateView.md)

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
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## createSupportReportTicket

> SupportReportTicketSummary createSupportReportTicket(reportId, supportReportTicketCreate)

Create Support Report Ticket

Create the tracker ticket of a report. Needs recent authentication.

### Example

```ts
import {
  Configuration,
  ServerAdminSupportReportsApi,
} from '';
import type { CreateSupportReportTicketRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ServerAdminSupportReportsApi();

  const body = {
    // string
    reportId: reportId_example,
    // SupportReportTicketCreate
    supportReportTicketCreate: ...,
  } satisfies CreateSupportReportTicketRequest;

  try {
    const data = await api.createSupportReportTicket(body);
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
| **supportReportTicketCreate** | [SupportReportTicketCreate](SupportReportTicketCreate.md) |  | |

### Return type

[**SupportReportTicketSummary**](SupportReportTicketSummary.md)

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
| **403** | The caller is authenticated but is not authorized for this operation. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The report already has a ticket link (SUPPORT_TICKET_EXISTS, with the link) or no tracker is configured (SUPPORT_TICKET_NOT_CONFIGURED). |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |
| **502** | The tracker did not create the ticket (SUPPORT_TICKET_FAILED). The link stays pending until it is cleared; the retry flag says whether another attempt can work. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## deleteSupportReplyTemplate

> deleteSupportReplyTemplate(templateId)

Delete Support Reply Template

Delete a template for good.

### Example

```ts
import {
  Configuration,
  ServerAdminSupportReportsApi,
} from '';
import type { DeleteSupportReplyTemplateRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ServerAdminSupportReportsApi();

  const body = {
    // string
    templateId: templateId_example,
  } satisfies DeleteSupportReplyTemplateRequest;

  try {
    const data = await api.deleteSupportReplyTemplate(body);
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
| **templateId** | `string` |  | [Defaults to `undefined`] |

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

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## deleteSupportReport

> deleteSupportReport(reportId)

Delete Support Report

Delete a report permanently with its reply and ticket link. Needs recent authentication.

### Example

```ts
import {
  Configuration,
  ServerAdminSupportReportsApi,
} from '';
import type { DeleteSupportReportRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ServerAdminSupportReportsApi();

  const body = {
    // string
    reportId: reportId_example,
  } satisfies DeleteSupportReportRequest;

  try {
    const data = await api.deleteSupportReport(body);
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

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


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


## listSupportReplyTemplates

> SupportReplyTemplateListView listSupportReplyTemplates()

List Support Reply Templates

List the reply templates shared by all ServerAdmins.

### Example

```ts
import {
  Configuration,
  ServerAdminSupportReportsApi,
} from '';
import type { ListSupportReplyTemplatesRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ServerAdminSupportReportsApi();

  try {
    const data = await api.listSupportReplyTemplates();
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters

This endpoint does not need any parameter.

### Return type

[**SupportReplyTemplateListView**](SupportReplyTemplateListView.md)

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

> SupportReportListView listSupportReports(state, archived, limit, cursor)

List Support Reports

List reports newest first with a note preview, never the full note.  Unarchived reports by default, the archived ones with &#x60;&#x60;archived&#x3D;true&#x60;&#x60;. The cursor is bound to the state filter and the archive view.

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
    // boolean (optional)
    archived: true,
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
| **archived** | `boolean` |  | [Optional] [Defaults to `false`] |
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


## setSupportReportArchived

> SupportReportDetailView setSupportReportArchived(reportId, supportReportArchiveUpdate)

Set Support Report Archived

Archive or unarchive a report; its triage state is kept. Needs recent authentication.

### Example

```ts
import {
  Configuration,
  ServerAdminSupportReportsApi,
} from '';
import type { SetSupportReportArchivedRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ServerAdminSupportReportsApi();

  const body = {
    // string
    reportId: reportId_example,
    // SupportReportArchiveUpdate
    supportReportArchiveUpdate: ...,
  } satisfies SetSupportReportArchivedRequest;

  try {
    const data = await api.setSupportReportArchived(body);
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
| **supportReportArchiveUpdate** | [SupportReportArchiveUpdate](SupportReportArchiveUpdate.md) |  | |

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


## updateSupportReplyTemplate

> SupportReplyTemplateView updateSupportReplyTemplate(templateId, supportReplyTemplateWrite)

Update Support Reply Template

Replace a template\&#39;s name and text.

### Example

```ts
import {
  Configuration,
  ServerAdminSupportReportsApi,
} from '';
import type { UpdateSupportReplyTemplateRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ServerAdminSupportReportsApi();

  const body = {
    // string
    templateId: templateId_example,
    // SupportReplyTemplateWrite
    supportReplyTemplateWrite: ...,
  } satisfies UpdateSupportReplyTemplateRequest;

  try {
    const data = await api.updateSupportReplyTemplate(body);
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
| **templateId** | `string` |  | [Defaults to `undefined`] |
| **supportReplyTemplateWrite** | [SupportReplyTemplateWrite](SupportReplyTemplateWrite.md) |  | |

### Return type

[**SupportReplyTemplateView**](SupportReplyTemplateView.md)

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

