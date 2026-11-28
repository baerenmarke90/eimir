
# SupportReportCreate

Strict request: an unknown field is rejected, not stored.

## Properties

Name | Type
------------ | -------------
`client` | [ClientContextBody](ClientContextBody.md)
`clientRequestId` | string
`failure` | [FailureReferenceBody](FailureReferenceBody.md)
`kind` | [SupportReportKind](SupportReportKind.md)
`note` | string

## Example

```typescript
import type { SupportReportCreate } from ''

// TODO: Update the object below with actual values
const example = {
  "client": null,
  "clientRequestId": null,
  "failure": null,
  "kind": null,
  "note": null,
} satisfies SupportReportCreate

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as SupportReportCreate
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


