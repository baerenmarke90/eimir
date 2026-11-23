
# FailureReferenceBody

The generalized failure reference on the wire (camelCase).

## Properties

Name | Type
------------ | -------------
`reference` | string
`requestId` | string

## Example

```typescript
import type { FailureReferenceBody } from ''

// TODO: Update the object below with actual values
const example = {
  "reference": null,
  "requestId": null,
} satisfies FailureReferenceBody

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as FailureReferenceBody
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


