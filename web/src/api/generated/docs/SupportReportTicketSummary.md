
# SupportReportTicketSummary

The tracker ticket of a report: where it lives, never what it says.

## Properties

Name | Type
------------ | -------------
`number` | number
`state` | [TicketState](TicketState.md)
`tracker` | string
`url` | string

## Example

```typescript
import type { SupportReportTicketSummary } from ''

// TODO: Update the object below with actual values
const example = {
  "number": null,
  "state": null,
  "tracker": null,
  "url": null,
} satisfies SupportReportTicketSummary

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as SupportReportTicketSummary
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


