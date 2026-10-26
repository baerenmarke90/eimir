
# PlaceCreate


## Properties

Name | Type
------------ | -------------
`address` | string
`description` | string
`latitude` | number
`longitude` | number
`mapUrl` | string
`name` | string

## Example

```typescript
import type { PlaceCreate } from ''

// TODO: Update the object below with actual values
const example = {
  "address": null,
  "description": null,
  "latitude": null,
  "longitude": null,
  "mapUrl": null,
  "name": null,
} satisfies PlaceCreate

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as PlaceCreate
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


