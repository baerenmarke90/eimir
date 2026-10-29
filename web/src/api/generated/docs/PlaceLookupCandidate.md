
# PlaceLookupCandidate


## Properties

Name | Type
------------ | -------------
`address` | string
`latitude` | number
`longitude` | number
`name` | string

## Example

```typescript
import type { PlaceLookupCandidate } from ''

// TODO: Update the object below with actual values
const example = {
  "address": null,
  "latitude": null,
  "longitude": null,
  "name": null,
} satisfies PlaceLookupCandidate

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as PlaceLookupCandidate
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


