
# SupportReportReplyView

The operator\'s reply, shown to the reporter as plain text.

## Properties

Name | Type
------------ | -------------
`repliedAt` | Date
`reportedAt` | Date
`text` | string

## Example

```typescript
import type { SupportReportReplyView } from ''

// TODO: Update the object below with actual values
const example = {
  "repliedAt": null,
  "reportedAt": null,
  "text": null,
} satisfies SupportReportReplyView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as SupportReportReplyView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


