
# SupportReportDetailView

One report in full, with its reply and ticket link.

## Properties

Name | Type
------------ | -------------
`accountId` | string
`appVersion` | string
`archivedAt` | Date
`build` | string
`client` | [ClientContextBody](ClientContextBody.md)
`createdAt` | Date
`failureReference` | string
`hasReply` | boolean
`id` | string
`kind` | [SupportReportKind](SupportReportKind.md)
`note` | string
`os` | string
`platform` | string
`reply` | [SupportReportOperatorReply](SupportReportOperatorReply.md)
`requestId` | string
`state` | [SupportReportState](SupportReportState.md)
`ticket` | [SupportReportTicketSummary](SupportReportTicketSummary.md)
`ticketAvailable` | boolean

## Example

```typescript
import type { SupportReportDetailView } from ''

// TODO: Update the object below with actual values
const example = {
  "accountId": null,
  "appVersion": null,
  "archivedAt": null,
  "build": null,
  "client": null,
  "createdAt": null,
  "failureReference": null,
  "hasReply": null,
  "id": null,
  "kind": null,
  "note": null,
  "os": null,
  "platform": null,
  "reply": null,
  "requestId": null,
  "state": null,
  "ticket": null,
  "ticketAvailable": null,
} satisfies SupportReportDetailView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as SupportReportDetailView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


