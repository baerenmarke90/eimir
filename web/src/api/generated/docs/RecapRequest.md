
# RecapRequest


## Properties

Name | Type
------------ | -------------
`kind` | [RecapKind](RecapKind.md)
`month` | number
`refresh` | boolean
`variant` | number
`year` | number

## Example

```typescript
import type { RecapRequest } from ''

// TODO: Update the object below with actual values
const example = {
  "kind": null,
  "month": null,
  "refresh": null,
  "variant": null,
  "year": null,
} satisfies RecapRequest

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as RecapRequest
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


