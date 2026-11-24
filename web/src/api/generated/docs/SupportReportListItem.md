
# SupportReportListItem

One report in the list: triage facts only, no note text.

## Properties

Name | Type
------------ | -------------
`appVersion` | string
`build` | string
`createdAt` | Date
`failureReference` | string
`hasReply` | boolean
`id` | string
`kind` | [SupportReportKind](SupportReportKind.md)
`state` | [SupportReportState](SupportReportState.md)
`ticket` | [SupportReportTicketSummary](SupportReportTicketSummary.md)

## Example

```typescript
import type { SupportReportListItem } from ''

// TODO: Update the object below with actual values
const example = {
  "appVersion": null,
  "build": null,
  "createdAt": null,
  "failureReference": null,
  "hasReply": null,
  "id": null,
  "kind": null,
  "state": null,
  "ticket": null,
} satisfies SupportReportListItem

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as SupportReportListItem
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


