
# SupportReportTicketCreate

Strict request: what the operator wrote; the technical footer is added by the server.

## Properties

Name | Type
------------ | -------------
`body` | string
`title` | string

## Example

```typescript
import type { SupportReportTicketCreate } from ''

// TODO: Update the object below with actual values
const example = {
  "body": null,
  "title": null,
} satisfies SupportReportTicketCreate

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as SupportReportTicketCreate
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


