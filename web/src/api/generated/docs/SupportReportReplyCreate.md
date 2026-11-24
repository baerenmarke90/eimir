
# SupportReportReplyCreate

Strict request: the reply is trimmed plain text of 1 to 500 characters.

## Properties

Name | Type
------------ | -------------
`text` | string

## Example

```typescript
import type { SupportReportReplyCreate } from ''

// TODO: Update the object below with actual values
const example = {
  "text": null,
} satisfies SupportReportReplyCreate

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as SupportReportReplyCreate
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


