
# SupportReportTicketProblem

Error body of the ticket routes: the usual problem plus the link or the retry flag.

## Properties

Name | Type
------------ | -------------
`code` | string
`detail` | string
`retryable` | boolean
`status` | number
`ticket` | [SupportReportTicketSummary](SupportReportTicketSummary.md)
`title` | string
`type` | string

## Example

```typescript
import type { SupportReportTicketProblem } from ''

// TODO: Update the object below with actual values
const example = {
  "code": null,
  "detail": null,
  "retryable": null,
  "status": null,
  "ticket": null,
  "title": null,
  "type": null,
} satisfies SupportReportTicketProblem

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as SupportReportTicketProblem
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


