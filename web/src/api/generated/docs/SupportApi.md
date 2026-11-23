# SupportApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**createSupportReport**](SupportApi.md#createsupportreport) | **POST** /api/v1/support-reports | Create Support Report |
| [**getSupportReportReply**](SupportApi.md#getsupportreportreply) | **GET** /api/v1/support-reports/{reportId}/reply | Get Support Report Reply |



## createSupportReport

> SupportReportCreated createSupportReport(supportReportCreate)

Create Support Report

Store a report once per client request identity.

### Example

```ts
import {
  Configuration,
  SupportApi,
} from '';
import type { CreateSupportReportRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new SupportApi();

  const body = {
    // SupportReportCreate
    supportReportCreate: ...,
  } satisfies CreateSupportReportRequest;

  try {
    const data = await api.createSupportReport(body);
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
| **supportReportCreate** | [SupportReportCreate](SupportReportCreate.md) |  | |

### Return type

[**SupportReportCreated**](SupportReportCreated.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | The request was already received; the original report is returned. |  -  |
| **201** | Successful Response |  -  |
| **401** | Authentication is missing, invalid, or the session has expired. |  -  |
| **404** | The resource does not exist or is not visible to the caller. |  -  |
| **409** | The request conflicts with the current state of the resource. |  -  |
| **422** | Request parameters or domain inputs are invalid. |  -  |
| **429** | Too many attempts occurred within the allowed time window. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getSupportReportReply

> SupportReportReplyView getSupportReportReply(reportId)

Get Support Report Reply

Return the reply to the caller\&#39;s own report.  Another person\&#39;s report, a report without a reply yet and an unknown id are the same 404. Replies already sent stay readable when the operator switches support reports off, so this is not gated by the flag. The text is returned exactly as stored.

### Example

```ts
import {
  Configuration,
  SupportApi,
} from '';
import type { GetSupportReportReplyRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new SupportApi();

  const body = {
    // string
    reportId: reportId_example,
  } satisfies GetSupportReportReplyRequest;

  try {
    const data = await api.getSupportReportReply(body);
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

[**SupportReportReplyView**](SupportReportReplyView.md)

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

