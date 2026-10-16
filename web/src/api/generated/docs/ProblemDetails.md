
# ProblemDetails

Body of every API error response.  The same model produces the runtime response and describes it in the OpenAPI contract. Maintaining those separately would eventually make the contract describe an error shape that the runtime does not return.

## Properties

Name | Type
------------ | -------------
`code` | string
`detail` | string
`status` | number
`title` | string
`type` | string

## Example

```typescript
import type { ProblemDetails } from ''

// TODO: Update the object below with actual values
const example = {
  "code": null,
  "detail": null,
  "status": null,
  "title": null,
  "type": null,
} satisfies ProblemDetails

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ProblemDetails
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


